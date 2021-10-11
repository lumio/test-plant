const path = require('path');
const fs = require('fs');
const uuid = require('uuid').v4;

const CODE_REGEX = /(<!-- puml:(?<pumlId>.+?) -->\s+!\[(?<alt>.+?)\]\((?<file>.+?)\)\s+<details>\s+<summary>.+?<\/summary>\s+```puml\s+(?<code1>[\s\S]+?)```\s+<\/details>)|(```puml\s+(?<code2>[\s\S]+?)```)/gm

function generatePlantUML(code, id = null) {
  let fileId = id;
  if (id == null) {
    fileId = uuid();
  }

  console.log({ code, fileId });
  return fileId;
}

function main() {
  const pumlIds = [];
  const raw = fs.readFileSync(path.join(__dirname, '../docs/README2.md'), 'utf8');
  const results = [];
  const replaced = raw.replace(CODE_REGEX, (match) => {
    const parsed = CODE_REGEX.exec(match);
    if (parsed == null) {
      return match;
    }

    const groups = parsed.groups;
    generatePlantUML(groups.code2);
    return '';
  })
}
main();
