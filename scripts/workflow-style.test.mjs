import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWorkflow } from "./workflow-style.mjs";

const check = (text, path = ".github/workflows/ci.yml") => checkWorkflow(text, path).map(({ line, message }) => ({ line, message }));
const doc = (...parts) => `${parts.flat().join("\n")}\n`;

// Lines 1–17; the first job starts on line 18.
const header = [
  "name: CI",
  "",
  "on:",
  "  pull_request:",
  "",
  "permissions:",
  "  contents: read",
  "",
  "concurrency:",
  "  group: ci",
  "  cancel-in-progress: true",
  "",
  "defaults:",
  "  run:",
  "    shell: bash",
  "",
  "jobs:",
];
// Lines 18–22; the first step starts on line 23.
const job = ["  test:", "    name: Test", "    runs-on: ubuntu-latest", "    timeout-minutes: 10", "    steps:"];
const step = ["      - name: Run", "        run: echo hi"];

const conforming = doc(
  "name: CI",
  "",
  "on:",
  "  pull_request:",
  "  push:",
  "    branches: [main]",
  "",
  "permissions:",
  "  contents: read",
  "",
  "concurrency:",
  "  group: ${{ github.workflow }}-${{ github.ref }}",
  "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  "",
  "defaults:",
  "  run:",
  "    shell: bash",
  "",
  "jobs:",
  "  test:",
  "    name: Test",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 10",
  "    env:",
  "      NODE_ENV: test",
  "    steps:",
  "      - name: Check out",
  "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  "        with:",
  "          persist-credentials: false",
  "",
  "      # Runs the whole suite.",
  "      - name: Run tests",
  '        if: "!cancelled()"',
  "        env:",
  "          REF: ${{ github.ref }}",
  "        run: |",
  '          echo "$REF"',
  "",
  "          node --test",
  "",
  "  publish:",
  "    name: Publish",
  "    needs: test",
  "    if: github.event_name != 'pull_request'",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 5",
  "    permissions:",
  "      packages: write",
  "    steps:",
  "      - name: Publish",
  "        run: echo done",
);

test("conforming sample passes", () => {
  assert.deepEqual(check(conforming), []);
});

test("findings carry the path", () => {
  const [finding] = checkWorkflow(doc(header, job, step), ".github/workflows/ci.yaml");
  assert.equal(finding.path, ".github/workflows/ci.yaml");
});

test("document start marker", () => {
  assert.deepEqual(check(doc("---", header, job, step)), [{ line: 1, message: "document start marker" }]);
});

test("yml extension", () => {
  assert.deepEqual(check(doc(header, job, step), ".github/workflows/ci.yaml"), [{ line: 1, message: "use the .yml extension" }]);
});

test("top-level key order", () => {
  const text = doc(header.slice(0, 5), header.slice(8), job, step, "", "permissions:", "  contents: read");
  assert.deepEqual(check(text), [{ line: 23, message: 'top-level key "permissions" out of order' }]);
});

test("missing permissions", () => {
  const text = doc(header.slice(0, 5), header.slice(8), job, step);
  assert.deepEqual(check(text), [{ line: 1, message: "missing top-level permissions" }]);
});

test("top-level write permissions", () => {
  const scoped = doc(header.slice(0, 6), "  contents: write", header.slice(7), job, step);
  assert.deepEqual(check(scoped), [{ line: 7, message: "top-level permissions must be read or none" }]);
  const all = doc(header.slice(0, 5), "permissions: write-all", header.slice(7), job, step);
  assert.deepEqual(check(all), [{ line: 6, message: "top-level permissions must be read or none" }]);
});

test("concurrency required with pull_request", () => {
  const text = doc(header.slice(0, 8), header.slice(12), job, step);
  assert.deepEqual(check(text), [{ line: 3, message: "missing concurrency for pull_request" }]);
  const pushOnly = doc("name: CI", "", "on:", "  push:", header.slice(4, 8), header.slice(12), job, step);
  assert.deepEqual(check(pushOnly), []);
});

test("bash shell required with run steps", () => {
  const withoutShell = doc(header.slice(0, 12), header.slice(16), job, step);
  assert.deepEqual(check(withoutShell), [{ line: 1, message: "missing defaults.run.shell: bash" }]);
  const usesOnly = doc(header.slice(0, 12), header.slice(16), job, "      - name: Check out", "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1");
  assert.deepEqual(check(usesOnly), []);
});

test("on must be a map", () => {
  const scalar = doc(header.slice(0, 2), "on: push", header.slice(4, 8), header.slice(12), job, step);
  assert.deepEqual(check(scalar), [{ line: 3, message: "on must be a map" }]);
  const list = doc(header.slice(0, 2), "on: [push, pull_request]", header.slice(4), job, step);
  assert.deepEqual(check(list), [
    { line: 3, message: "flow lists hold at most one item" },
    { line: 3, message: "on must be a map" },
  ]);
});

test("job name and timeout", () => {
  const text = doc(header, "  test:", "    runs-on: ubuntu-latest", "    steps:", step);
  assert.deepEqual(check(text), [
    { line: 18, message: 'job "test" has no name' },
    { line: 18, message: 'job "test" has no timeout-minutes' },
  ]);
});

test("step keys", () => {
  const text = doc(
    header,
    job,
    "      - run: echo a",
    "",
    "      - id: x",
    "        name: Second",
    "        run: echo b",
    "",
    "      - name: Third",
    "        run: echo c",
    "        env:",
    "          A: b",
    "",
    "      - name: Fourth",
    "        shell: bash",
    "        run: echo d",
  );
  assert.deepEqual(check(text), [
    { line: 23, message: "step has no name" },
    { line: 25, message: "name must be the first key of a step" },
    { line: 31, message: "run must be the last key of a step" },
    { line: 35, message: "no per-step shell" },
  ]);
});

test("if conditions", () => {
  const text = doc(
    header,
    job,
    "      - name: A",
    "        if: ${{ github.ref == 'refs/heads/main' }}",
    "        run: echo a",
    "",
    "      - name: B",
    "        if: always()",
    "        run: echo b",
    "",
    "      - name: C",
    '        if: "!cancelled()"',
    "        run: echo c",
  );
  assert.deepEqual(check(text), [
    { line: 24, message: "if without ${{ }}" },
    { line: 28, message: "use !cancelled() instead of always()" },
  ]);
});

test("expressions inside run", () => {
  const text = doc(header, job, "      - name: A", "        run: echo ${{ github.ref }}", "", "      - name: B", "        run: |", "          echo start", "          echo ${{ github.sha }}");
  const message = "expression inside run; pass it through env";
  assert.deepEqual(check(text), [
    { line: 24, message },
    { line: 29, message },
  ]);
});

test("spacing between steps", () => {
  const none = doc(header, job, "      - name: A", "        run: echo a", "      - name: B", "        run: echo b");
  assert.deepEqual(check(none), [{ line: 25, message: "one empty line between steps" }]);
  const two = doc(header, job, "      - name: A", "        run: echo a", "", "", "      - name: B", "        run: echo b");
  assert.deepEqual(check(two), [{ line: 27, message: "one empty line between steps" }]);
});

test("no empty line before steps", () => {
  const text = doc(header, job.slice(0, 4), "", "    steps:", step);
  assert.deepEqual(check(text), [{ line: 23, message: "no empty line before steps" }]);
});

test("services sit between empty lines right before steps", () => {
  const services = ["    services:", "      postgres:", "        image: postgres:18"];
  assert.deepEqual(check(doc(header, job.slice(0, 4), "", services, "", "    steps:", step)), []);
  assert.deepEqual(check(doc(header, job.slice(0, 4), "", "    # Databases for the tests.", services, "", "    # The suite.", "    steps:", step)), []);
  assert.deepEqual(check(doc(header, job.slice(0, 4), services, "    steps:", step)), [
    { line: 22, message: "one empty line before services" },
    { line: 25, message: "one empty line between services and steps" },
  ]);
  assert.deepEqual(check(doc(header, job.slice(0, 3), "", services, "    timeout-minutes: 10", "    steps:", step)), [
    { line: 22, message: "services must come right before steps" },
  ]);
});

test("spacing between jobs and top-level keys", () => {
  const text = doc(header.slice(0, 4), header.slice(5), job, step, "  lint:", "    name: Lint", "    runs-on: ubuntu-latest", "    timeout-minutes: 10", "    steps:", step);
  assert.deepEqual(check(text), [
    { line: 5, message: "one empty line between top-level keys" },
    { line: 24, message: "one empty line between jobs" },
  ]);
});

test("double quotes", () => {
  assert.deepEqual(check(doc(header, job, "      - name: 'Run'", "        run: echo hi")), [{ line: 23, message: "use double quotes" }]);
});

test("unsupported constructs", () => {
  const anchors = doc(header, job, "      - name: A", "        env: &common", "          A: b", "        run: echo a", "", "      - name: B", "        env: *common", "        run: echo b");
  assert.deepEqual(check(anchors), [
    { line: 24, message: "anchors and aliases are not supported" },
    { line: 29, message: "anchors and aliases are not supported" },
  ]);
  const flowMap = doc(header, job, "      - name: A", "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1", "        with: { fetch-depth: 0 }");
  assert.deepEqual(check(flowMap), [{ line: 25, message: "flow maps are not supported" }]);
  const flowList = doc(header.slice(0, 4), "  push:", "    branches: [main, dev]", header.slice(4), job, step);
  assert.deepEqual(check(flowList), [{ line: 6, message: "flow lists hold at most one item" }]);
});

test("Windows paths still select composite-action mode", () => {
  const action = doc("name: Setup", "", "runs:", "  using: composite", "  steps:", "    - name: Install", "      shell: bash", "      run: pnpm install");
  assert.deepEqual(check(action, ".github\\actions\\setup\\action.yml"), []);
});

test("unindented sequences keep every item", () => {
  const text = doc(header, job.slice(0, 4), "    steps:", "    - name: A", "      run: echo a", "", "    - run: echo b");
  assert.deepEqual(check(text), [{ line: 26, message: "step has no name" }]);
});

test("a double-quoted on key is still the on key", () => {
  const text = doc(header.slice(0, 2), '"on":', header.slice(3), job, step);
  assert.deepEqual(check(text), []);
});

test("a document marker with a comment is still a document marker", () => {
  assert.deepEqual(check(doc("--- # yaml-language-server: $schema=x", header, job, step)), [{ line: 1, message: "document start marker" }]);
});

test("job-level defaults.run is not a run step", () => {
  const text = doc(header.slice(0, 12), header.slice(16), "  test:", "    name: Test", "    runs-on: ubuntu-latest", "    timeout-minutes: 10", "    defaults:", "      run:", "        working-directory: backend", "    steps:", "      - name: Check out", "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1");
  assert.deepEqual(check(text), []);
});

test("CRLF input gives the same findings as LF", () => {
  const lf = doc(header, job, "      - run: echo a", "      - name: B", "        shell: bash", "        run: echo ${{ github.ref }}");
  const crlf = lf.replaceAll("\n", "\r\n");
  assert.notDeepEqual(check(lf), []);
  assert.deepEqual(check(crlf), check(lf));
  assert.deepEqual(check(conforming.replaceAll("\n", "\r\n")), []);
});

test("block scalars are opaque except for expressions", () => {
  const text = doc(
    header,
    job,
    "      - name: A",
    "        run: |",
    "          cat <<EOF > x.yml",
    "          key: value",
    "",
    "          - item",
    "          echo ${{ github.ref }}",
    "          EOF",
    "",
    "      - name: B",
    "        run: echo b",
  );
  assert.deepEqual(check(text), [{ line: 29, message: "expression inside run; pass it through env" }]);
});

test("comments do not affect spacing or order", () => {
  const text = doc(
    header,
    job,
    "      - name: A",
    "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "",
    "      # Second step.",
    "      - name: B",
    "        run: echo b",
  );
  assert.deepEqual(check(text), []);
});

test("reusable-workflow jobs and composite actions are exempt where GitHub requires it", () => {
  const caller = doc(header, "  checks:", "    name: Checks", "    uses: BSStudio/.github/.github/workflows/shared-checks.yml@3d3c42e5aac5ba805825da76410c181273ba90b1 # v1.0.0", "    with:", "      dependency-review: true");
  assert.deepEqual(check(caller), []);
  const action = doc(
    "name: Setup",
    "",
    "description: Install dependencies",
    "",
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Install",
    "      shell: bash",
    "      run: pnpm install",
    "",
    "    - name: Build",
    "      shell: bash",
    "      run: pnpm build",
  );
  assert.deepEqual(check(action, ".github/actions/setup/action.yml"), []);
});
