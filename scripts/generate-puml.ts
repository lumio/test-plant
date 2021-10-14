import path from "path";
import fs from "fs";
import { readdir, unlink } from "fs/promises";
import { createHash } from "crypto";
import { spawn } from "child_process";
import stream from "stream";
import fastGlob from "fast-glob";

/**
 * The glob pattern to be looked at
 */
const INPUT_FILE_GLOB = "**/*.md";

/**
 * The output folder, relative to this script
 */
const OUTPUT_FOLDER = path.resolve(__dirname, "../docs/generated-assets");

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

type FileName = string;
type Code = string;

interface ArgOptions {
  rewriteAll: boolean;
}

interface GeneratedReplacementResult {
  generateFromCode?: string;
  file?: string;
  codeHash?: string;
  generated?: string;
}

const defaultOptions = {
  rewriteAll: false,
};

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
 * The regex pattern to find a generated image from a linked puml file
 */
const GENERATED_PUML_IMAGE_PATTERN =
  "(<!-- puml-ref:(?<hashRef>.+?) -->\\s+!\\[(?<altRef>.+?)\\]\\((?<fileGeneratedRef>.+?)\\))";
/**
 * The regex pattern to find image referencing a puml file
 */
const PUML_IMAGE_PATTERN =
  "(([ ]{4}|\\t)?!\\[(?<altRefImage>.+?)\\]\\((?<filePumlRef>.+?\\.puml)\\))";
/**
 * A combination of both the GENERATED_PATTERN and CODE_PATTERN to find both
 */
const MAIN_REGEX = new RegExp(
  // Parsing an already processed code block
  GENERATED_PATTERN +
    "|" +
    // Parsing a regular code block
    CODE_PATTERN +
    "|" +
    // Parsing an already processed puml image red
    GENERATED_PUML_IMAGE_PATTERN +
    "|" +
    // Parsing a referenced puml image
    PUML_IMAGE_PATTERN,
  "gm"
);
const GENERATED_PUML_IMAGE_PATTERN_REGEX = new RegExp(
  GENERATED_PUML_IMAGE_PATTERN
);
const PUML_IMAGE_PATTERN_REGEX = new RegExp(PUML_IMAGE_PATTERN);
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
  sourceFile: string,
  code: string,
  hash?: string
): Promise<FileName> {
  if (code == null) {
    throw new Error("No code given");
  }

  const codeHash = hash || getHash(code);
  const fileName = path.resolve(OUTPUT_FOLDER, `${codeHash}.${OUTPUT_FORMAT}`);
  return new Promise((resolve) => {
    const output: Buffer[] = [];
    const child = spawn("docker", [
      "run",
      "--rm",
      "-i",
      "think/plantuml",
      `-t${OUTPUT_FORMAT}`,
    ]);
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    child.stdout.on("data", (chunk) => {
      output.push(chunk);
    });
    child.on("close", () => {
      fs.writeFileSync(fileName, Buffer.concat(output));
      resolve(fileName);
    });
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
 * Generates multiple UMLs from a map
 * @param hashesToGenerate
 * @param hashesFileMap
 */
async function generatePlantUmlFromHashMap(
  hashesToGenerate: { [key: string]: string },
  hashesFileMap: { [key: string]: string }
) {
  const promises: Promise<any>[] = [];
  for (const entry of Object.entries(hashesToGenerate)) {
    const [codeHash, code] = entry;
    console.log(`Generating ${codeHash}...`);
    promises.push(generatePlantUML(hashesFileMap[codeHash], code, codeHash));
  }
  await Promise.all(promises);
}

/**
 * TODO: add description
 * @param file
 * @param match
 * @param groups
 * @param options
 */
function updateGeneratedHtml(
  file: FileName,
  match: string,
  groups: any,
  options: ArgOptions
): GeneratedReplacementResult | string {
  const currentHash = groups.hash;
  const codeHash = getHash(groups.code1);
  const diff = currentHash !== codeHash;

  if (diff) {
    return {
      generateFromCode: groups.code1,
      file,
      codeHash,
      generated: generateHtml(
        file,
        groups.code1,
        codeHash,
        groups.customAlt1 || groups.alt || DEFAULT_ALT,
        groups.toggleText || DEFAULT_TOGGLE_TEXT
      ),
    };
  } else if (!diff && options.rewriteAll) {
    return {
      generateFromCode: groups.code1,
      file,
      codeHash,
    };
  }

  return {
    codeHash: currentHash,
    generated: match,
  };
}

/**
 * TODO: better description
 * Generates toggle HTML from plantUML
 * @param file
 * @param match
 * @param groups
 */
function generateHtmlFromCodeBlock(
  file: FileName,
  match: string,
  groups: any
): GeneratedReplacementResult | string {
  if (isIndentedCodeBlock(match)) {
    return match;
  }
  const codeHash = getHash(groups.code2);
  return {
    generateFromCode: groups.code2,
    file,
    codeHash,
    generated: generateHtml(file, groups.code2, codeHash, groups.customAlt2),
  };
}

function generateImageRefFromPuml(
  sourceFileName: FileName,
  codeHash: string,
  alt: string
) {
  const sourceDir = path.dirname(sourceFileName);
  const assetDir = path.resolve(__dirname, OUTPUT_FOLDER);
  const relativeAssetDir = path.relative(sourceDir, assetDir);
  return [
    `<!-- puml-ref:${codeHash} -->`,
    `![${alt}](${getFileName(codeHash, relativeAssetDir)})`,
  ].join("\n");
}

function generateFromPumlImage(
  file: FileName,
  match: string,
  groups: any
): GeneratedReplacementResult | string {
  if (isIndentedCodeBlock(match)) {
    return match;
  }
  const absoluteFileName = path.resolve(path.dirname(file), groups.filePumlRef);
  try {
    const puml = fs.readFileSync(absoluteFileName, "utf8");
    const codeHash = getHash(puml);
    return {
      generateFromCode: puml,
      file,
      codeHash,
      generated: generateImageRefFromPuml(file, codeHash, groups.altRefImage),
    };
  } catch (err) {
    console.error((err as any)?.message || err);
    return match;
  }
}

/**
 * Processes a file and either generate the HTML or update it
 * @param file    The file to be processed
 * @param options Options on how to process given file
 */
async function processFile(file: FileName, options = defaultOptions) {
  const raw = fs.readFileSync(file, "utf8");
  const fileHash = getHash(raw);

  const hashes: string[] = [];
  const hashesToGenerate: { [key: string]: Code } = {};
  const hashesFileMap: { [key: string]: FileName } = {};

  const processed = raw.replace(MAIN_REGEX, (match) => {
    const parsed =
      GENERATED_REGEX.exec(match) ||
      CODE_REGEX.exec(match) ||
      GENERATED_PUML_IMAGE_PATTERN_REGEX.exec(match) ||
      PUML_IMAGE_PATTERN_REGEX.exec(match);

    if (parsed == null) {
      return match;
    }

    const groups = parsed.groups;
    if (!groups) {
      return match;
    }

    let result;
    if (groups.fileGeneratedRef) {
      return match;
    } else if (groups.filePumlRef) {
      result = generateFromPumlImage(file, match, groups);
    } else if (groups.code1) {
      result = updateGeneratedHtml(file, match, groups, options);
    } else if (groups.code2) {
      result = generateHtmlFromCodeBlock(file, match, groups);
    }

    if (typeof result === "string") {
      return result;
    }
    if (result == null) {
      return match;
    }

    if (result.codeHash) {
      hashes.push(result.codeHash);
      if (result.generateFromCode) {
        hashesToGenerate[result.codeHash] = result.generateFromCode;
      }
      if (result.file) {
        hashesFileMap[result.codeHash] = result.file;
      }
    }

    return result.generated || match;
  });

  await generatePlantUmlFromHashMap(hashesToGenerate, hashesFileMap);

  if (fileHash !== getHash(processed)) {
    fs.writeFileSync(file, processed);
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
  // Naive way of "parsing" argv
  let rewriteAll = false;
  const argv = process.argv.slice(2).filter((option) => {
    if (option === "--rewrite-all") {
      rewriteAll = true;
      return false;
    }
    return true;
  });

  const cwd = process.cwd();
  const globPattern = argv[0] || INPUT_FILE_GLOB;

  const writtenAssets: Set<string> = new Set();
  const files = await fastGlob(globPattern, {
    absolute: true,
    ignore: ["node_modules"],
  });

  for (const file of files) {
    console.log(`Processing ${path.relative(cwd, file)}...`);
    const hashes = await processFile(file, { rewriteAll });
    hashes.forEach((hash) => writtenAssets.add(`${hash}.${OUTPUT_FORMAT}`));
  }

  console.log("Cleanup...");
  await checkGeneratedAssets(writtenAssets);
  console.log("Done");
}
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
