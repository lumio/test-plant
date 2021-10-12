import path from "path";
import fs from "fs";
import { createHash } from "crypto";

const OUTPUT_FILES = "../docs/generated-assets";
const OUTPUT_FORMAT = "svg";

const PUML_REGEX = new RegExp(
  "(<!-- puml:(?<pumlHash>.+?) -->\\s+!\\[(?<alt>.+?)\\]\\((?<file>.+?)\\)" +
    "\\s+<details>\\s+<summary>.+?<\\/summary>\\s+```puml\\s+(?<code1>[\\s\\S]+?)```\\s+<\\/details>)" +
    "|" +
    "(```puml\\s+(?<code2>[\\s\\S]+?)```)",
  "gm"
);

function generateHtml(code: string, hash: string) {}

function generatePlantUML(code: string, hash?: string) {
  if (code == null) {
    throw new Error("No code given");
  }

  let codeHash = hash;
  if (hash == null) {
    const newHash = createHash("sha256");
    newHash.update(code);
    codeHash = newHash.digest("hex");
  }

  console.log({ code, codeHash });
  return codeHash;
}

function main() {
  const raw = fs.readFileSync(
    path.join(__dirname, "../docs/README2.md"),
    "utf8"
  );
  const replaced = raw.replace(PUML_REGEX, (match) => {
    const parsed = PUML_REGEX.exec(match);
    if (parsed == null) {
      return match;
    }

    const groups = parsed.groups;
    if (!groups) {
      return match;
    }

    console.log(groups);
    generatePlantUML(groups.code2);
    return "";
  });
}
main();
