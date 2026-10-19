import { gh, readJson } from "./io.mjs";
import { currentSettings, desiredSettings, diffSettings, formatEntry, MERGE_QUERY, selectRepos, writes } from "./settings.mjs";

const usage = "usage: node scripts/apply-settings.mjs [--dry-run] [owner/repo]...";
const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
const baseline = readJson("settings/baseline.json");
const repos = readJson("settings/repos.json");

let selected;
try {
  selected = selectRepos(dryRun ? args.slice(1) : args, repos);
} catch (error) {
  console.error(`${error.message}\n${usage}`);
  process.exit(2);
}

// A repo without a security configuration answers 204 with no body.
const get = async (path) => {
  const text = await gh(["api", path]);
  return text.trim() === "" ? null : JSON.parse(text);
};
const getMerge = async (repo) => {
  const [owner, name] = repo.split("/");
  const text = await gh(["api", "graphql", "-f", `query=${MERGE_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`]);
  const body = JSON.parse(text);
  if (!body.data?.repository) throw new Error(`graphql ${repo}: ${body.errors?.map((error) => error.message).join("; ") ?? "no repository in the answer"}`);
  return body.data.repository;
};
const readCurrent = async (repo) => {
  const [repository, merge, workflow, securityFixes, configuration] = await Promise.all([
    get(`repos/${repo}`),
    getMerge(repo),
    get(`repos/${repo}/actions/permissions/workflow`),
    get(`repos/${repo}/automated-security-fixes`),
    get(`repos/${repo}/code-security-configuration`),
  ]);
  return currentSettings({ repository, merge, workflow, securityFixes, configuration });
};

async function apply(repo) {
  const lines = [];
  try {
    const desired = desiredSettings(baseline, repos[repo]);
    const diff = diffSettings(await readCurrent(repo), desired);
    if (diff.length === 0) return { lines: [`${repo}: up to date`], failed: false };
    lines.push(...diff.map((entry) => `${repo} ${formatEntry(entry)}`));
    if (dryRun) return { lines, failed: true };
    for (const call of writes(repo, diff, desired)) {
      const body = call.body && JSON.stringify(call.body);
      await gh(["api", "-X", call.method, call.path, ...(body ? ["--input", "-"] : [])], body);
    }
    // Read back: GitHub can accept a field and not apply it.
    const remaining = diffSettings(await readCurrent(repo), desired);
    if (remaining.length === 0) lines.push(`${repo}: applied`);
    lines.push(...remaining.map((entry) => `${repo} still differs, ${formatEntry(entry)}`));
    return { lines, failed: remaining.length > 0 };
  } catch (error) {
    lines.push(`${repo}: failed: ${error.message}`);
    return { lines, failed: true };
  }
}

// Repos run in parallel; their lines print in the order the repos were selected.
const results = await Promise.all(selected.map(apply));
for (const { lines } of results) for (const line of lines) console.log(line);
process.exitCode = results.some((result) => result.failed) ? 1 : 0;
