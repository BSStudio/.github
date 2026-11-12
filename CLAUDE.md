# CLAUDE.md

Organisation-wide defaults for Budavári Schönherz Stúdió's GitHub repositories: the settings shared by the repos listed in `settings/repos.json`, the baseline `main` ruleset, and the shared workflow checks every repo calls. [README.md](README.md) explains each part and the scripts that apply it, [docs/workflows.md](docs/workflows.md) is the workflow convention, and [SECURITY.md](SECURITY.md) is the security policy the organisation's repos inherit.

## Before calling something done

```bash
node --test "scripts/*.test.mjs"
```

This repository's own `checks.yml` calls `shared-checks.yml` from the same commit, so the PR runs any change to the checks against this repository first, except the Dependencies job, which this repository doesn't enable.

## Commits and branches

Commit messages and PR titles are plain imperative sentences. PRs are squash-merged: the PR title becomes the commit on `main`, with an empty body.

## Rules

- Live GitHub settings change only when asked: `scripts/apply-settings.mjs` and `scripts/apply-ruleset.mjs` write to the organisation's repos, so otherwise run them with `--dry-run` only.
- A repo added to `settings/repos.json` also needs the "BSStudio settings check" GitHub App installed on it, which you can't do: tell the user.
- `docs/workflows.md` and `scripts/workflow-style.mjs` stay in step: a change to the convention goes in together with the checker change that enforces it.
- A change to the shared checks reaches other repos only through a release: callers pin `shared-checks.yml` by the release commit's SHA with a `# vX.Y.Z` comment, and Renovate opens a PR in each caller for the new pin. The job names (`Workflows`, `Dependencies`) and the `dependency-review` input are an interface: every repo's ruleset requires `Checks / Workflows` by name, so renaming either blocks those PRs until every caller and ruleset is updated.
- Files in `assets/` keep their paths: other repos' READMEs embed them from `https://raw.githubusercontent.com/BSStudio/.github/main/assets/`.
