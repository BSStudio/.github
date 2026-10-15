import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { currentSettings, desiredSettings, diffSettings, formatEntry, selectRepos, writes } from "./settings.mjs";

const usage = "usage: node scripts/apply-settings.mjs [--dry-run] [owner/repo]...";
const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
const read = (file) => JSON.parse(readFileSync(new URL(`../settings/${file}`, import.meta.url), "utf8"));
const baseline = read("baseline.json");
const repos = read("repos.json");

let selected;
try {
  selected = selectRepos(dryRun ? args.slice(1) : args, repos);
} catch (error) {
  console.error(`${error.message}\n${usage}`);
  process.exit(2);
}

const gh = (ghArgs, input) => execFileSync("gh", ghArgs, { input, encoding: "utf8", stdio: "pipe" });
// A repo without a security configuration answers 204 with no body.
const get = (path) => {
  const text = gh(["api", path]);
  return text.trim() === "" ? null : JSON.parse(text);
};
const readCurrent = (repo) =>
  currentSettings({
    repository: get(`repos/${repo}`),
    workflow: get(`repos/${repo}/actions/permissions/workflow`),
    securityFixes: get(`repos/${repo}/automated-security-fixes`),
    configuration: get(`repos/${repo}/code-security-configuration`),
  });

let failed = false;
for (const repo of selected) {
  try {
    const desired = desiredSettings(baseline, repos[repo]);
    const diff = diffSettings(readCurrent(repo), desired);
    if (diff.length === 0) {
      console.log(`${repo}: up to date`);
      continue;
    }
    for (const entry of diff) console.log(`${repo} ${formatEntry(entry)}`);
    if (dryRun) {
      failed = true;
      continue;
    }
    for (const call of writes(repo, diff, desired)) {
      const body = call.body && JSON.stringify(call.body);
      gh(["api", "-X", call.method, call.path, ...(body ? ["--input", "-"] : [])], body);
    }
    // Read back: GitHub can accept a field and not apply it.
    const remaining = diffSettings(readCurrent(repo), desired);
    if (remaining.length === 0) console.log(`${repo}: applied`);
    for (const entry of remaining) console.log(`${repo} still differs, ${formatEntry(entry)}`);
    if (remaining.length > 0) failed = true;
  } catch (error) {
    console.log(`${repo}: failed: ${error.stderr?.trim() || error.message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
