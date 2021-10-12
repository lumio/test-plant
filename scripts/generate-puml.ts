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
const RELATIVE_ASSET_FOLDER = "./generated-assets";
const OUTPUT_FILES = "../docs/generated-assets";
const OUTPUT_FORMAT = "svg";

const DEFAULT_ALT = "UML";
const DEFAULT_TOGGLE_TEXT = "Show/Hide plantUML code";

type FileName = string;
type Code = string;

const PUML_REGEX = new RegExp(
  "(<!-- puml:(?<hash>.+?) -->\\s+!\\[(?<alt>.+?)\\]\\((?<file>.+?)\\)" +
    "\\s+<details>\\s+<summary>(?<toggleText>.+?)<\\/summary>\\s+```puml\\s+(?<code1>[\\s\\S]+?)```\\s+<\\/details>)" +
    "|" +
    "(```puml\\s+(?<code2>[\\s\\S]+?)```)",
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
  base = "",
  alt = DEFAULT_ALT,
  toggle = DEFAULT_TOGGLE_TEXT
) {
  return [
    `<!-- puml:${hash} -->`,
    `![${alt}](${getFileName(hash, base)})`,
    "<details>",
    `<summary>${toggle}</summary>`,
    "",
    "```puml",
    code + "```",
    "</details>",
  ].join("\n");
}

function generatePlantUML(code: string, hash?: string): Promise<FileName> {
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
        if (err) {
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

async function processFile(file: FileName) {
  const fullFileName = path.resolve(__dirname, INPUT_FILE_CWD, file);
  const raw = fs.readFileSync(fullFileName, "utf8");
  const fileHash = getHash(raw);

  const hashes: string[] = [];
  const hashesToGenerate: { [key: string]: Code } = {};

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
        return generateHtml(
          groups.code1,
          codeHash,
          RELATIVE_ASSET_FOLDER,
          groups.alt || DEFAULT_ALT,
          groups.toggleText || DEFAULT_TOGGLE_TEXT
        );
      } else if (!diff && REWRITE_ALL) {
        hashesToGenerate[codeHash] = groups.code1;
        hashes.push(codeHash);
      } else {
        hashes.push(currentHash);
      }
      return match;
    } else if (groups.code2) {
      const codeHash = getHash(groups.code2);
      hashes.push(codeHash);
      hashesToGenerate[codeHash] = groups.code2;
      return generateHtml(groups.code2, codeHash, RELATIVE_ASSET_FOLDER);
    }

    return "";
  });

  for (const entry of Object.entries(hashesToGenerate)) {
    const [codeHash, code] = entry;
    try {
      console.log(`Generating ${codeHash}...`);
      await generatePlantUML(code, codeHash);
    } catch (e) {
      console.error(`Error while processing ${file}!`);
      console.error(`Code:\n${code}`);
      throw e;
    }
  }

  if (fileHash !== getHash(processed)) {
    fs.writeFileSync(fullFileName, processed);
  }

  return hashes;
}

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
