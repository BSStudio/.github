import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildRuleset, findRulesetId } from "./ruleset.mjs";

const base = JSON.parse(readFileSync(new URL("../rulesets/main.json", import.meta.url), "utf8"));
const rule = (ruleset, type) => ruleset.rules.find((r) => r.type === type);

test("fills in the required checks", () => {
  const ruleset = buildRuleset(base, ["Test", "Lint and typecheck"]);
  assert.deepEqual(rule(ruleset, "required_status_checks").parameters.required_status_checks, [
    { context: "Test" },
    { context: "Lint and typecheck" },
  ]);
});

test("drops the status check rule when the repo has no checks", () => {
  assert.equal(rule(buildRuleset(base, []), "required_status_checks"), undefined);
});

test("leaves the base untouched", () => {
  buildRuleset(base, ["Test"]);
  assert.deepEqual(rule(base, "required_status_checks").parameters.required_status_checks, []);
});

test("keeps the merge settings approve-merges depends on", () => {
  const pr = rule(buildRuleset(base, ["Test"]), "pull_request").parameters;
  assert.deepEqual(pr.allowed_merge_methods, ["squash"]);
  assert.equal(pr.require_code_owner_review, true);
  assert.equal(pr.dismiss_stale_reviews_on_push, false);
  assert.equal(rule(buildRuleset(base, ["Test"]), "required_status_checks").parameters.strict_required_status_checks_policy, false);
  assert.deepEqual(base.bypass_actors, []);
});

test("finds an existing ruleset whatever the case of its name", () => {
  assert.equal(findRulesetId([{ id: 1, name: "Other" }, { id: 7, name: "Main" }], "main"), 7);
});

test("finds nothing when no ruleset has the name", () => {
  assert.equal(findRulesetId([{ id: 1, name: "Other" }], "main"), undefined);
});
