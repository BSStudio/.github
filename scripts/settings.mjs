// Pure helpers, kept apart from the CLI so the tests never call gh.

const isGroup = (value) => typeof value === "object" && value !== null;

export function selectRepos(names, repos) {
  if (names.length === 0) return Object.keys(repos);
  const unknown = names.filter((name) => !Object.hasOwn(repos, name));
  if (unknown.length > 0) throw new Error(`not in settings/repos.json: ${unknown.join(", ")}`);
  return names;
}

export function desiredSettings(baseline, override) {
  const desired = structuredClone(baseline);
  for (const [key, value] of Object.entries(override)) {
    desired[key] = isGroup(value) ? { ...desired[key], ...value } : value;
  }
  return desired;
}

// A "removed" or "detached" status still names the configuration the repo had.
export function currentSettings({ repository, workflow, securityFixes, configuration }) {
  const applies = configuration !== null && ["attached", "enforced"].includes(configuration.status);
  return {
    repository,
    workflow,
    dependabotSecurityUpdates: securityFixes.enabled,
    securityConfiguration: applies ? configuration.configuration.name : null,
  };
}

// Only keys the desired state names are compared; a null there skips the check.
export function diffSettings(current, desired) {
  const diff = [];
  for (const [group, value] of Object.entries(desired)) {
    if (value === null) continue;
    if (!isGroup(value)) {
      if (current[group] !== value) diff.push({ group, key: null, from: current[group], to: value });
      continue;
    }
    for (const [key, to] of Object.entries(value)) {
      const from = current[group]?.[key];
      if (from !== to) diff.push({ group, key, from, to });
    }
  }
  return diff;
}

// The security configuration is attached in the org settings, so a difference there produces no call.
export function writes(repo, diff, desired) {
  const changed = (group) => diff.filter((entry) => entry.group === group);
  const calls = [];
  const repository = changed("repository");
  if (repository.length > 0) {
    calls.push({ method: "PATCH", path: `repos/${repo}`, body: Object.fromEntries(repository.map((entry) => [entry.key, entry.to])) });
  }
  if (changed("workflow").length > 0) {
    calls.push({ method: "PUT", path: `repos/${repo}/actions/permissions/workflow`, body: desired.workflow });
  }
  if (changed("dependabotSecurityUpdates").length > 0) {
    calls.push({ method: desired.dependabotSecurityUpdates ? "PUT" : "DELETE", path: `repos/${repo}/automated-security-fixes` });
  }
  return calls;
}

const show = (value) => (value === undefined ? "missing" : JSON.stringify(value));

export function formatEntry({ group, key, from, to }) {
  return `${key === null ? group : `${group}.${key}`}: ${show(from)} → ${show(to)}`;
}
