# CLAUDE.md

Organisation-wide defaults for Budavári Schönherz Stúdió's GitHub repositories: the settings every public repo shares, the baseline `main` ruleset, and the shared workflow checks every repo calls. [README.md](README.md) explains each part and the scripts that apply it, [docs/workflows.md](docs/workflows.md) is the workflow convention, and [SECURITY.md](SECURITY.md) is the security policy the organisation's repos inherit.

## Before calling something done

```bash
node --test "scripts/*.test.mjs"
```

This repository's own `checks.yml` calls `shared-checks.yml` from the same commit, so the PR runs any change to the checks against this repository first.

## Commits and branches

Commit messages and PR titles are plain imperative sentences. PRs are squash-merged: the PR title becomes the commit on `main`, with an empty body.

## Rules

- Live GitHub settings change only when asked: `scripts/apply-settings.mjs` and `scripts/apply-ruleset.mjs` write to the organisation's repos, so otherwise run them with `--dry-run` only.
- `docs/workflows.md` and `scripts/workflow-style.mjs` stay in step: a change to the convention goes in together with the checker change that enforces it.
- A change to the shared checks reaches other repos only through a release: callers pin `shared-checks.yml` by the release commit's SHA with a `# vX.Y.Z` comment, and Renovate proposes the new pin once a release is published.
