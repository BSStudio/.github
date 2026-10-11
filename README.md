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
