import { readFileSync } from "node:fs";
import { checkWorkflow } from "./workflow-style.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/check-workflows.mjs <workflow or action file>...");
  process.exit(2);
}

const annotate = process.env.GITHUB_ACTIONS === "true";
let status = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    status = 2;
    continue;
  }
  for (const { path, line, message } of checkWorkflow(text, file)) {
    console.log(annotate ? `::error file=${path},line=${line}::${message}` : `${path}:${line}: ${message}`);
    status ||= 1;
  }
}
process.exitCode = status;
