import path from "path";
import fs from "fs";
import { readdir, unlink } from "fs/promises";
import { createHash } from "crypto";
import { exec } from "child_process";
import stream from "stream";
import fastGlob from "fast-glob";

/**
 * The glob pattern to be looked at
 */
const INPUT_FILE_GLOB = "**/*.md";

/**
 * TODO: should be irrelevant
 * This one is a bit confusing still. Basically the root directory of the docs
 */
const INPUT_FILE_CWD = "../docs";

/**
 * The output folder, relative to this script
 */
const OUTPUT_FOLDER = "../docs/generated-assets";

/**
 * The image format. Possible values are svg and png
 */
const OUTPUT_FORMAT = "svg";

/**
 * This is the default alt text of a diagram. It can be overwritten however by
 * adding a descriptive text after the code block type.
 *
 * E.g.:
 * ```puml Alternative alt text
 * @startuml
 * ...
 * @enduml
 * ```
 */
const DEFAULT_ALT = "UML";

/**
 * This is the default toggle text. It can be changed afterwards if needed.
 */
const DEFAULT_TOGGLE_TEXT = "source code";

/**
 * Regenerate all plantUML diagrams
 */
const REWRITE_ALL =
  process.argv.includes("--rewrite-all") ||
  Boolean(process.env.REWRITE_ALL) ||
  false;

type FileName = string;
type Code = string;

/**
 * The regex pattern to find already processed plantUML code blocks
 */
const GENERATED_PATTERN =
  "(<!-- puml:(?<hash>.+?) -->\\s+!\\[(?<alt>.+?)\\]\\((?<file>.+?)\\)" +
  "\\s+<details>\\s+<summary>(?<toggleText>.+?)<\\/summary>\\s+```puml( (?<customAlt1>.+?))?\\s+(?<code1>[\\s\\S]+?)```\\s+<\\/details>)";
/**
 * The regex pattern to find plantUML code blocks
 */
const CODE_PATTERN =
  "(([ ]{4}|\\t)?```puml( (?<customAlt2>.+?))?\\s+(?<code2>[\\s\\S]+?)```)";
/**
 * A combination of both the GENERATED_PATTERN and CODE_PATTERN to find both
 */
const MAIN_REGEX = new RegExp(
  // Parsing an already processed code block
  GENERATED_PATTERN +
    "|" +
    // Parsing a regular code block
    CODE_PATTERN,
  "gm"
);
const GENERATED_REGEX = new RegExp(GENERATED_PATTERN);
const CODE_REGEX = new RegExp(CODE_PATTERN);

/**
 * Returns the SHA-256 hash of a code block
 * @param code The code block itself
 */
function getHash(code: string) {
  const newHash = createHash("sha256");
  newHash.update(code);
  return newHash.digest("hex");
}

/**
 * TODO: Is this one really relevant?
 * @param hash The hashed value of the code block
 * @param base A base path to be prepended
 */
function getFileName(hash: string, base = "") {
  return path.join(base, `${hash}.${OUTPUT_FORMAT}`);
}

/**
 * Determines if the code block is actually an indented code block containing
 * a Markdown code block. If so it should not be processed furthermore.
 * @param match The matched code block
 */
function isIndentedCodeBlock(match: string) {
  const startsWithSpaceMatch = /^([ ]{4}|\t)/.exec(match);
  if (startsWithSpaceMatch == null) {
    return false;
  }
  const whitespace = startsWithSpaceMatch[0];
  const lines = match.split("\n");
  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    if (!line.startsWith(whitespace)) {
      return false;
    }
  }

  return true;
}

/**
 * Wraps the code block into some HTML and puts the diagram image in front
 * @param sourceFileName Contains the source file name to retrieve the relative
 *                       path to the image
 * @param code           The content of the code block
 * @param hash           The hashed value of the code block which is being used
 *                       to get the file name
 * @param alt            If the alt text was already parsed, then this argument
 *                       is used to set it
 * @param toggle         The toggle text. If it was already set, it is reused
 *                       here
 */
function generateHtml(
  sourceFileName: string,
  code: Code,
  hash: string,
  alt = DEFAULT_ALT,
  toggle = DEFAULT_TOGGLE_TEXT
) {
  const sourceDir = path.dirname(sourceFileName);
  const assetDir = path.resolve(__dirname, OUTPUT_FOLDER);
  const relativeAssetDir = path.relative(sourceDir, assetDir);
  return [
    `<!-- puml:${hash} -->`,
    `![${alt}](${getFileName(hash, relativeAssetDir)})`,
    "<details>",
    `<summary>${toggle}</summary>`,
    "",
    "```puml",
    code + "```",
    "</details>",
  ].join("\n");
}

/**
 * Executes plantUML using docker and generates the image
 * @param sourceFile The source file where the code was found. This is used to
 *                   map an error to the file
 * @param code       The actual plantUML code
 * @param hash       The hashed code value to use for the filename
 */
function generatePlantUML(
  sourceFile?: string,
  code: string,
  hash?: string
): Promise<FileName> {
  if (code == null) {
    throw new Error("No code given");
  }

  const codeHash = hash || getHash(code);
  const fileName = getFileName(codeHash);
  return new Promise((resolve) => {
    const child = exec(
      `docker run --rm -i think/plantuml -t${OUTPUT_FORMAT} > ${fileName}`,
      {
        cwd: path.resolve(__dirname, OUTPUT_FOLDER),
      },
      (err, result) => {
        if (err && err.message?.includes("Syntax Error")) {
          const printFile = sourceFile || `one file`;
          console.error(
            `Error: There was a syntax error in ${sourceFile}! See processed file for more info.`
          );
        } else if (err) {
          throw err;
        }

        resolve(fileName);
      }
    );
    if (!child.stdin) {
      throw new Error("Missing stdin stream");
    }
    const stdinStream = new stream.Readable();
    stdinStream.push(code);
    stdinStream.push(null);
    stdinStream.pipe(child.stdin);
  });
}

/**
 * TODO: Split up into multiple functions
 * Processes a file and either generate the HTML or update it
 * @param file The file to be processed
 */
async function processFile(file: FileName) {
  const fullFileName = path.resolve(__dirname, INPUT_FILE_CWD, file);
  const raw = fs.readFileSync(fullFileName, "utf8");
  const fileHash = getHash(raw);

  const hashes: string[] = [];
  const hashesToGenerate: { [key: string]: Code } = {};
  const hashesFileMap: { [key: string]: FileName } = {};

  const processed = raw.replace(MAIN_REGEX, (match) => {
    const parsed = GENERATED_REGEX.exec(match) || CODE_REGEX.exec(match);

    if (parsed == null) {
      return match;
    }

    const groups = parsed.groups;
    if (!groups) {
      return match;
    }

    if (groups.code1) {
      const currentHash = groups.hash;
      const codeHash = getHash(groups.code1);
      const diff = currentHash !== codeHash;

      if (diff) {
        hashesToGenerate[codeHash] = groups.code1;
        hashesFileMap[codeHash] = file;
        hashes.push(codeHash);
        return generateHtml(
          fullFileName,
          groups.code1,
          codeHash,
          groups.customAlt1 || groups.alt || DEFAULT_ALT,
          groups.toggleText || DEFAULT_TOGGLE_TEXT
        );
      } else if (!diff && REWRITE_ALL) {
        hashesToGenerate[codeHash] = groups.code1;
        hashesFileMap[codeHash] = file;
        hashes.push(codeHash);
      } else {
        hashes.push(currentHash);
      }
      return match;
    } else if (groups.code2) {
      if (isIndentedCodeBlock(match)) {
        return match;
      }
      const codeHash = getHash(groups.code2);
      hashes.push(codeHash);
      hashesToGenerate[codeHash] = groups.code2;
      hashesFileMap[codeHash] = file;
      return generateHtml(
        fullFileName,
        groups.code2,
        codeHash,
        groups.customAlt2
      );
    }

    return match;
  });

  for (const entry of Object.entries(hashesToGenerate)) {
    const [codeHash, code] = entry;
    try {
      console.log(`Generating ${codeHash}...`);
      await generatePlantUML(hashesFileMap[codeHash], code, codeHash);
    } catch (e) {
      console.error(`Error while processing ${file}!`);
      console.error(`Code:\n${code}`);
      console.error(e);
    }
  }

  if (fileHash !== getHash(processed)) {
    fs.writeFileSync(fullFileName, processed);
  }

  return hashes;
}

/**
 * Checks the integrity of the generated-assets folder
 * @param writtenAssets The image files that were being created during the main
 *                      processing of markdown files
 */
async function checkGeneratedAssets(writtenAssets: Set<string>) {
  const generatedAssets = await readdir(path.resolve(__dirname, OUTPUT_FOLDER));
  for (const asset of generatedAssets) {
    // Ignore other generated files
    if (!asset.endsWith(`.${OUTPUT_FORMAT}`)) {
      continue;
    }

    // Ignore assets that are in use
    if (writtenAssets.has(asset)) {
      continue;
    }

    // Remove unused asset
    const hash = asset.substring(0, asset.length - OUTPUT_FORMAT.length - 1);
    console.log(`Removing ${hash}...`);
    await unlink(path.resolve(__dirname, OUTPUT_FOLDER, asset));
  }

  writtenAssets.forEach((writtenAsset) => {
    if (!generatedAssets.includes(writtenAsset)) {
      throw new Error(
        `Missing asset ${writtenAsset}! Run script with arg --rewrite-all`
      );
    }
  });
}

async function main() {
  const writtenAssets: Set<string> = new Set();
  const files = await fastGlob(INPUT_FILE_GLOB, {
    cwd: path.resolve(__dirname, INPUT_FILE_CWD),
  });
  for (const file of files) {
    const hashes = await processFile(file);
    hashes.forEach((hash) => writtenAssets.add(`${hash}.${OUTPUT_FORMAT}`));
  }

  await checkGeneratedAssets(writtenAssets);
  console.log("Done");
}
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
