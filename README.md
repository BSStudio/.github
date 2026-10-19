<p align="center">
  <img src="https://raw.githubusercontent.com/BSStudio/.github/main/assets/bss-logo.png" width="40%" alt="Budavári Schönherz Stúdió logo">
</p>

---

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

Settings must not drift unnoticed: `.github/workflows/settings-drift.yml` runs the dry run every Monday morning and fails when anything differs. It reads the repos with a token from the read-only "BSStudio settings check" GitHub App (Administration: read), which is installed on the repos in `settings/repos.json`; a repo added to that file needs the App installed too. The merge settings are read through GraphQL, because the REST API shows them only to tokens that can write the repo's contents. Fixing drift stays a local run of the script. GitHub turns scheduled workflows off after 60 days without activity in the repo and emails about it; Renovate's monthly PRs normally keep it active.

A named repo must be listed in `settings/repos.json`. A run writes only what differs, then reads the repo again and reports anything GitHub did not take. Run it as an admin of the listed repos: without admin rights GitHub leaves some settings out of its answers (they show as `missing`) and refuses the writes. A failed call is reported with the `gh` command that failed.

Security features (secret scanning, push protection, Dependabot alerts, CodeQL default setup, private vulnerability reporting) come from the organisation's "GitHub recommended" code security configuration, which is the default for new public repos. The script checks that it is attached and never attaches it.

## Workflows

Every workflow follows one convention, written down in [`docs/workflows.md`](docs/workflows.md). Each repo enforces it with a `.github/workflows/checks.yml` that calls `.github/workflows/shared-checks.yml` here (the copyable caller is in the convention): `Checks / Workflows` runs actionlint, zizmor and `scripts/check-workflows.mjs` over the repo's workflows and composite actions, and `Checks / Dependencies` reviews new dependencies for vulnerabilities and licences in repos that turn it on. Wherever a ruleset exists it requires `Checks / Workflows`, plus `Checks / Dependencies` where the review is on.

Callers pin a tagged release of this repo; Renovate proposes each new release. The checks run from the same commit as the workflow that calls them: `shared-checks.yml` reaches its composite action through the `$/` self-repository syntax.
