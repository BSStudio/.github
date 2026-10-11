// Pure helpers, kept apart from the CLI so the tests never call gh.

export function buildRuleset(base, checks) {
  const ruleset = structuredClone(base);
  if (checks.length === 0) {
    // GitHub rejects or blocks on an empty list, so the rule goes.
    ruleset.rules = ruleset.rules.filter((rule) => rule.type !== "required_status_checks");
    return ruleset;
  }
  const rule = ruleset.rules.find((r) => r.type === "required_status_checks");
  rule.parameters.required_status_checks = checks.map((context) => ({ context }));
  return ruleset;
}

// Case-insensitive: helm-charts' existing ruleset is called "Main".
export function findRulesetId(rulesets, name) {
  return rulesets.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id;
}
