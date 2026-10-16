import { gh, readJson } from "./io.mjs";
import { buildRuleset, findRulesetId } from "./ruleset.mjs";

const usage = "usage: node scripts/apply-ruleset.mjs [--dry-run] <owner/repo> [required check]...";
const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
const [repo, ...checks] = dryRun ? args.slice(1) : args;
if (!repo?.includes("/")) {
  console.error(usage);
  process.exit(2);
}

const base = readJson("rulesets/main.json");
const body = JSON.stringify(buildRuleset(base, checks), null, 2);
if (dryRun) {
  console.log(body);
  process.exit(0);
}

try {
  const id = findRulesetId(JSON.parse(await gh(["api", `repos/${repo}/rulesets`])), base.name);
  if (id) {
    await gh(["api", "-X", "PUT", `repos/${repo}/rulesets/${id}`, "--input", "-"], body);
    console.log(`updated ruleset ${id} on ${repo}`);
  } else {
    await gh(["api", "-X", "POST", `repos/${repo}/rulesets`, "--input", "-"], body);
    console.log(`created ruleset on ${repo}`);
  }
} catch (error) {
  console.error(`${repo}: failed: ${error.message}`);
  process.exitCode = 1;
}
