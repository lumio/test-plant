import path from "path";
import fs from "fs";
import { readdir, unlink } from "fs/promises";
import { createHash } from "crypto";
import { exec } from "child_process";
import stream from "stream";
import fastGlob from "fast-glob";

const REWRITE_ALL = Boolean(process.env.REWRITE_ALL) || false;
const INPUT_FILE_GLOB = "**/*.md";
const INPUT_FILE_CWD = "../docs";
const OUTPUT_FILES = "../docs/generated-assets";
const OUTPUT_FORMAT = "svg";

const DEFAULT_ALT = "UML";
const DEFAULT_TOGGLE_TEXT = "source code";

type FileName = string;
type Code = string;

const PUML_REGEX = new RegExp(
  // Just to make sure that indented code blocks are getting ignored (e.g. giving an example on how to use this script
  "(    ```puml[\\s\\S]+?```)" +
    "|" +
    // Parsing an already processed code block
    "(<!-- puml:(?<hash>.+?) -->\\s+!\\[(?<alt>.+?)\\]\\((?<file>.+?)\\)" +
    "\\s+<details>\\s+<summary>(?<toggleText>.+?)<\\/summary>\\s+```puml( (?<customAlt1>.+?))?\\s+(?<code1>[\\s\\S]+?)```\\s+<\\/details>)" +
    "|" +
    // Parsing a regular code block
    "((?!my)```puml( (?<customAlt2>.+?))?\\s+(?<code2>[\\s\\S]+?)```)",
  "gm"
);

function getHash(code: string) {
  const newHash = createHash("sha256");
  newHash.update(code);
  return newHash.digest("hex");
}

function getFileName(hash: string, base = "") {
  return path.join(base, `${hash}.${OUTPUT_FORMAT}`);
}

function generateHtml(
  code: Code,
  hash: string,
  sourceFileName: string,
  alt = DEFAULT_ALT,
  toggle = DEFAULT_TOGGLE_TEXT
) {
  const sourceDir = path.dirname(sourceFileName);
  const assetDir = path.resolve(__dirname, OUTPUT_FILES);
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

function generatePlantUML(
  code: string,
  hash?: string,
  sourceFile?: string
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
        cwd: path.resolve(__dirname, OUTPUT_FILES),
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
 * Processes a file and either generates
 * @param file
 */
async function processFile(file: FileName) {
  const fullFileName = path.resolve(__dirname, INPUT_FILE_CWD, file);
  const raw = fs.readFileSync(fullFileName, "utf8");
  const fileHash = getHash(raw);

  const hashes: string[] = [];
  const hashesToGenerate: { [key: string]: Code } = {};
  const hashesFileMap: { [key: string]: FileName } = {};

  const processed = raw.replace(PUML_REGEX, (match) => {
    const parsed = PUML_REGEX.exec(match);
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
          groups.code1,
          codeHash,
          fullFileName,
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
      const codeHash = getHash(groups.code2);
      hashes.push(codeHash);
      hashesToGenerate[codeHash] = groups.code2;
      hashesFileMap[codeHash] = file;
      return generateHtml(
        groups.code2,
        codeHash,
        fullFileName,
        groups.customAlt2
      );
    }

    return match;
  });

  for (const entry of Object.entries(hashesToGenerate)) {
    const [codeHash, code] = entry;
    try {
      console.log(`Generating ${codeHash}...`);
      await generatePlantUML(code, codeHash, hashesFileMap[codeHash]);
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
 *
 * @param writtenAssets
 */
async function checkGeneratedAssets(writtenAssets: Set<string>) {
  const generatedAssets = await readdir(path.resolve(__dirname, OUTPUT_FILES));
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
    await unlink(path.resolve(__dirname, OUTPUT_FILES, asset));
  }

  writtenAssets.forEach((writtenAsset) => {
    if (!generatedAssets.includes(writtenAsset)) {
      throw new Error(
        `Missing asset ${writtenAsset}! Run script with env var REWRITE_ALL=1`
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
