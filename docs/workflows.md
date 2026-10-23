# Workflow convention

Every GitHub Actions workflow and composite action in the studio's repositories follows these rules, so a workflow in one repository reads like one in any other and the same mistakes are caught everywhere. The `Checks / Workflows` check enforces them on every pull request: actionlint for syntax and shell scripts, zizmor for security, and `scripts/check-workflows.mjs` for the rest. The few rules that need judgement are kept in review and marked as such.

## Files

- Workflows end in `.yml` and start without a `---` document marker.
- Top-level keys come in this order: `name`, `on`, `permissions`, `concurrency`, `defaults`, `env`, `jobs`.
- `on` is a map. A flow list holds at most one item (`branches: [main]`); two or more items go in a block list.
- The files stay inside the plain subset of YAML the checker reads: block style with 2-space indentation, no anchors or aliases, no flow maps.

## Permissions and secrets

- A workflow grants no more than reading by default: `permissions` is always set at the top, normally to `contents: read`. Write scopes go on the one job that needs them.
- No code from a pull request runs with a write scope. A job that runs on pull requests holds one only if every step that uses it is skipped on pull requests, or if the job checks nothing out and its steps are pinned actions that act on the pull request itself. The first case covers today's single build-and-push jobs of the publish workflows, until they move to a shared publish workflow that splits building from pushing; the second covers labeling pull requests.
- Secrets are passed only on events other than `pull_request`, except upload tokens that can only add reports, such as Codecov's (review).
- Checkouts set `persist-credentials: false`; a job that pushes keeps the credentials and says why in a comment.
- Every action is pinned by its full commit SHA with the release in a comment, `@<sha> # vX.Y.Z`. Renovate keeps the pins current.

## Concurrency and shell

- A new push to a pull request cancels the run it replaces: every workflow that runs on `pull_request` sets `concurrency` with `group: ${{ github.workflow }}-${{ github.ref }}` and `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
- A failing command fails its step, including inside a pipe: every workflow with a `run` step sets `defaults.run.shell: bash`. Naming bash explicitly turns on `pipefail`; the implicit default shell does not.
- `working-directory` lives in `defaults.run`: at workflow level when every job shares it, otherwise per job. A step sets its own only when it alone differs. Action inputs such as `with: working-directory` are not affected.

## Jobs

- Every job has a `name` and a `timeout-minutes`, about two to three times its usual duration. A job that calls a reusable workflow cannot set a timeout and is exempt.
- A job that is a required status check keeps its name, because renaming it leaves pull requests waiting for a check that never reports (review).
- A value several steps use goes in the job's `env` once.

## Steps

- Every step has a sentence-case `name` as its first key, and `run` comes last.
- A step runs one command that lives in the repository: a package script, `uv run …`, or a script file. Shell longer than a few lines moves into a script, so local runs and CI run the same thing and shellcheck sees it (review).
- `if` conditions are written without `${{ }}`, and use `!cancelled()` instead of `always()`.
- No `${{ }}` inside `run`: values reach the shell through `env`, so nothing from the event payload is spliced into a script.

## Spacing and quoting

- Exactly one empty line separates top-level keys, jobs and steps; there is none right before `steps`. A job with `services` puts them right before `steps`, with one empty line before and after them.
- Plain strings go unquoted; patterns such as globs and cron expressions, and strings YAML requires quoted, use double quotes.

## Composite actions

The same rules apply to `action.yml` files, except that GitHub requires `shell` on every `run` step there.

## Calling the shared checks

Every repository runs the checks through the reusable workflow in this repository, from a `.github/workflows/checks.yml` like this:

```yaml
name: Checks

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  checks:
    name: Checks
    uses: BSStudio/.github/.github/workflows/shared-checks.yml@<release commit SHA> # vX.Y.Z
    with:
      dependency-review: true
```

- The job must be named `Checks`: the checks then report as `Checks / Workflows` and `Checks / Dependencies`, the names the repository's ruleset requires.
- `dependency-review: true` adds the dependency review for repositories with package manifests. It works on public repositories only and checks every new or changed dependency for known vulnerabilities and for a licence outside the allow-list in `shared-checks.yml`. Without the input the `Dependencies` job is skipped, which still satisfies a required check.
- The pin follows this repository's releases: Renovate proposes each new release in every caller, and that pull request runs the new checks against the repository before anything merges.

## Running the checks locally

From a repository's root, with actionlint and zizmor installed and this repository cloned next to it:

```bash
actionlint
GH_TOKEN=$(gh auth token) zizmor --config ../.github/.github/actions/workflow-checks/zizmor.yml .
node ../.github/scripts/check-workflows.mjs .github/workflows/*.yml .github/actions/*/action.yml
```
