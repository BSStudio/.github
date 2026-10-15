# .github

Organisation-wide defaults for Budavári Schönherz Stúdió repositories.

## Branch ruleset

`rulesets/main.json` is the baseline `main` ruleset for public repos: PRs only, squash merges, code owner review, approvals kept on push, linear history, no force pushes or deletion, no bypass (admins included). Required checks differ per repo, so the script fills them in:

```bash
node scripts/apply-ruleset.mjs BSStudio/backstage "Commit messages" "Lint and typecheck" "Test"
node scripts/apply-ruleset.mjs --dry-run BSStudio/backstage "Test"   # print, do not apply
```

It updates the repo's existing ruleset named `main` (any case) or creates one. Only list checks that run on every PR: a path-filtered check never reports on unrelated PRs and blocks them.

"Branch must be up to date" stays off. Renovate's frozen weekly batch (see [`renovate-config`](https://github.com/BSStudio/renovate-config)) would otherwise go stale with every merge.

## Repository settings

Every public repo we maintain has the same settings: squash merges only, with the PR title and an empty body, merged branches deleted, no "Update branch" button, auto-merge allowed, issues on, wiki and projects off, a read-only `GITHUB_TOKEN` that cannot approve PRs, and Dependabot security updates off (Renovate opens those PRs). `settings/baseline.json` holds that state, `settings/repos.json` lists the repos and what differs per repo. A repo without required status checks keeps auto-merge off: auto-merge waits only for the checks a ruleset requires.

```bash
node scripts/apply-settings.mjs --dry-run                     # list differences, exit 1 if any
node scripts/apply-settings.mjs                               # fix them in every listed repo
node scripts/apply-settings.mjs --dry-run BSStudio/backstage  # one repo
```

A named repo must be listed in `settings/repos.json`. A run writes only what differs, then reads the repo again and reports anything GitHub did not take.

Security features (secret scanning, push protection, Dependabot alerts, CodeQL default setup, private vulnerability reporting) come from the organisation's "GitHub recommended" code security configuration, which is the default for new public repos. The script checks that it is attached and never attaches it.
