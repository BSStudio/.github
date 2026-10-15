import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { currentSettings, desiredSettings, diffSettings, formatEntry, selectRepos, writes } from "./settings.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../settings/${file}`, import.meta.url), "utf8"));
const baseline = read("baseline.json");
const repos = read("repos.json");
const repo = "BSStudio/request-manager";

// request-manager's responses, trimmed to a few fields more than the baseline names.
const responses = {
  repository: {
    full_name: "BSStudio/request-manager",
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    squash_merge_commit_title: "PR_TITLE",
    squash_merge_commit_message: "BLANK",
    delete_branch_on_merge: true,
    allow_update_branch: true,
    allow_auto_merge: true,
    has_issues: true,
    has_wiki: false,
    has_projects: true,
  },
  workflow: { default_workflow_permissions: "write", can_approve_pull_request_reviews: true },
  securityFixes: { enabled: false, paused: false },
  configuration: { status: "removed", configuration: { id: 23162, name: "Legacy" } },
};

test("all repos when none are named", () => {
  assert.deepEqual(selectRepos([], repos), Object.keys(repos));
});

test("only the named repos", () => {
  assert.deepEqual(selectRepos(["BSStudio/backstage"], repos), ["BSStudio/backstage"]);
});

test("refuses a repo outside repos.json", () => {
  assert.throws(
    () => selectRepos(["BSStudio/backstage", "BSStudio/Raktr", "--dryrun"], repos),
    /not in settings\/repos\.json: BSStudio\/Raktr, --dryrun/,
  );
});

test("a group override changes only its own keys", () => {
  const desired = desiredSettings(baseline, { repository: { has_issues: false } });
  assert.equal(desired.repository.has_issues, false);
  assert.equal(desired.repository.has_wiki, false);
  assert.deepEqual(desired.workflow, baseline.workflow);
});

test("a top-level override replaces the baseline value", () => {
  assert.equal(desiredSettings(baseline, { securityConfiguration: null }).securityConfiguration, null);
});

test("leaves the baseline and the override untouched", () => {
  const before = structuredClone(baseline);
  const override = { repository: { has_issues: false } };
  desiredSettings(baseline, override);
  assert.deepEqual(baseline, before);
  assert.deepEqual(override, { repository: { has_issues: false } });
});

test("every override in repos.json names a baseline setting of the same kind", () => {
  const isGroup = (value) => typeof value === "object" && value !== null;
  for (const [name, override] of Object.entries(repos)) {
    for (const [group, value] of Object.entries(override)) {
      assert.ok(Object.hasOwn(baseline, group), `${name}: ${group}`);
      assert.equal(isGroup(value), isGroup(baseline[group]), `${name}: ${group} must be ${isGroup(baseline[group]) ? "an object" : "a value"}`);
      if (!isGroup(value)) continue;
      for (const key of Object.keys(value)) assert.ok(Object.hasOwn(baseline[group], key), `${name}: ${group}.${key}`);
    }
  }
});

test("reads the API responses in the baseline's shape", () => {
  const current = currentSettings(responses);
  assert.equal(current.repository.allow_update_branch, true);
  assert.deepEqual(current.workflow, responses.workflow);
  assert.equal(current.dependabotSecurityUpdates, false);
});

test("a removed configuration counts as none", () => {
  assert.equal(currentSettings(responses).securityConfiguration, null);
});

test("an attached or enforced configuration counts by name", () => {
  for (const status of ["attached", "enforced"]) {
    const configuration = { status, configuration: { id: 17, name: "GitHub recommended" } };
    assert.equal(currentSettings({ ...responses, configuration }).securityConfiguration, "GitHub recommended");
  }
});

test("no configuration at all counts as none", () => {
  assert.equal(currentSettings({ ...responses, configuration: null }).securityConfiguration, null);
});

test("lists each setting that differs", () => {
  const diff = diffSettings(currentSettings(responses), desiredSettings(baseline, repos[repo]));
  assert.deepEqual(diff, [
    { group: "repository", key: "allow_update_branch", from: true, to: false },
    { group: "repository", key: "has_projects", from: true, to: false },
    { group: "workflow", key: "default_workflow_permissions", from: "write", to: "read" },
    { group: "workflow", key: "can_approve_pull_request_reviews", from: true, to: false },
    { group: "securityConfiguration", key: null, from: null, to: "GitHub recommended" },
  ]);
});

test("an up-to-date repo has no differences, whatever else the API returns", () => {
  const desired = desiredSettings(baseline, repos[repo]);
  const current = structuredClone(desired);
  current.repository.full_name = repo;
  assert.deepEqual(diffSettings(current, desired), []);
});

test("a setting the API did not return counts as different", () => {
  const desired = desiredSettings(baseline, repos[repo]);
  const current = structuredClone(desired);
  delete current.repository.allow_update_branch;
  assert.deepEqual(diffSettings(current, desired), [{ group: "repository", key: "allow_update_branch", from: undefined, to: false }]);
});

test("a null in the desired state skips that check", () => {
  const desired = desiredSettings(baseline, { ...repos[repo], securityConfiguration: null });
  assert.equal(diffSettings(currentSettings(responses), desired).some((entry) => entry.group === "securityConfiguration"), false);
});

test("patches only the repository settings that differ", () => {
  const desired = desiredSettings(baseline, repos[repo]);
  const calls = writes(repo, diffSettings(currentSettings(responses), desired), desired);
  assert.deepEqual(calls[0], { method: "PATCH", path: `repos/${repo}`, body: { allow_update_branch: false, has_projects: false } });
});

test("sends the whole workflow group when one of its settings differs", () => {
  const diff = [{ group: "workflow", key: "can_approve_pull_request_reviews", from: true, to: false }];
  assert.deepEqual(writes(repo, diff, desiredSettings(baseline, {})), [
    {
      method: "PUT",
      path: `repos/${repo}/actions/permissions/workflow`,
      body: { default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
    },
  ]);
});

test("turns Dependabot security updates off with DELETE and on with PUT", () => {
  const diff = (to) => [{ group: "dependabotSecurityUpdates", key: null, from: !to, to }];
  const off = desiredSettings(baseline, {});
  const on = desiredSettings(baseline, { dependabotSecurityUpdates: true });
  assert.deepEqual(writes(repo, diff(false), off), [{ method: "DELETE", path: `repos/${repo}/automated-security-fixes` }]);
  assert.deepEqual(writes(repo, diff(true), on), [{ method: "PUT", path: `repos/${repo}/automated-security-fixes` }]);
});

test("never writes the security configuration", () => {
  const diff = [{ group: "securityConfiguration", key: null, from: "Legacy", to: "GitHub recommended" }];
  assert.deepEqual(writes(repo, diff, desiredSettings(baseline, {})), []);
});

test("no differences, no calls", () => {
  assert.deepEqual(writes(repo, [], desiredSettings(baseline, {})), []);
});

test("formats a group setting", () => {
  assert.equal(
    formatEntry({ group: "workflow", key: "default_workflow_permissions", from: "write", to: "read" }),
    'workflow.default_workflow_permissions: "write" → "read"',
  );
});

test("formats a top-level setting and a missing value", () => {
  assert.equal(
    formatEntry({ group: "securityConfiguration", key: null, from: null, to: "GitHub recommended" }),
    'securityConfiguration: null → "GitHub recommended"',
  );
  assert.equal(formatEntry({ group: "repository", key: "allow_update_branch", from: undefined, to: false }), "repository.allow_update_branch: missing → false");
});
