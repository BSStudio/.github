import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildRuleset, findRulesetId } from "./ruleset.mjs";

const usage = "usage: node scripts/apply-ruleset.mjs [--dry-run] <owner/repo> [required check]...";
const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
const [repo, ...checks] = dryRun ? args.slice(1) : args;
if (!repo?.includes("/")) {
  console.error(usage);
  process.exit(2);
}

const base = JSON.parse(readFileSync(new URL("../rulesets/main.json", import.meta.url), "utf8"));
const body = JSON.stringify(buildRuleset(base, checks), null, 2);
if (dryRun) {
  console.log(body);
  process.exit(0);
}

const gh = (ghArgs, input) => execFileSync("gh", ghArgs, { input, encoding: "utf8" });
const id = findRulesetId(JSON.parse(gh(["api", `repos/${repo}/rulesets`])), base.name);
if (id) {
  gh(["api", "-X", "PUT", `repos/${repo}/rulesets/${id}`, "--input", "-"], body);
  console.log(`updated ruleset ${id} on ${repo}`);
} else {
  gh(["api", "-X", "POST", `repos/${repo}/rulesets`, "--input", "-"], body);
  console.log(`created ruleset on ${repo}`);
}
