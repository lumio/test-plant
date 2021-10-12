import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import { exec } from "child_process";
import stream from "stream";

const ASSET_FOLDER = "generated-assets";
const OUTPUT_FILES = "../docs/" + ASSET_FOLDER;
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

function generateHtml(code: Code, hash: string) {
  return [
    `<!-- puml:${hash} -->`,
    `![${DEFAULT_ALT}](${getFileName(hash)})`,
    "<details>",
    `<summary>${DEFAULT_TOGGLE_TEXT}</summary>`,
    "",
    "```puml",
    code,
    "```",
    "</details>",
  ].join("\n");
}

function updateGeneratedHtml(code: string, hash: string) {}

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
  const raw = fs.readFileSync(file, "utf8");
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
      console.log(groups);
    } else if (groups.code2) {
      const codeHash = getHash(groups.code2);
      hashesToGenerate[codeHash] = groups.code2;
      return generateHtml(groups.code2, codeHash);
    }

    return "";
  });

  for (const entry of Object.entries(hashesToGenerate)) {
    const [codeHash, code] = entry;
    console.log(codeHash);
    // const fileName = await generatePlantUML(groups.code2);
  }

  console.log(processed);
}

async function main() {
  await processFile(path.join(__dirname, "../docs/README2.md"));
}
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
