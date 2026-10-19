import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./check-workflows.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "check-workflows-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const write = (name, text) => {
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
};
const run = (files, env = {}) => {
  const { GITHUB_ACTIONS, ...rest } = process.env;
  return spawnSync(process.execPath, [cli, ...files], { encoding: "utf8", env: { ...rest, ...env } });
};

const clean = write(
  "clean.yml",
  ["name: CI", "", "on:", "  push:", "", "permissions:", "  contents: read", "", "jobs:", "  test:", "    name: Test", "    runs-on: ubuntu-latest", "    timeout-minutes: 5", "    steps:", "      - name: Check out", "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1", ""].join("\n"),
);
const broken = write("broken.yml", "---\nname: CI\n");

test("a clean file prints nothing and exits 0", () => {
  const result = run([clean]);
  assert.equal(result.stdout, "");
  assert.equal(result.status, 0);
});

test("findings print as path:line: message and exit 1", () => {
  const result = run([broken]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`^${broken.replaceAll("\\", "\\\\")}:1: document start marker$`, "m"));
});

test("inside GitHub Actions findings become error annotations", () => {
  const result = run([broken], { GITHUB_ACTIONS: "true" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error file=.*broken\.yml,line=1::document start marker$/m);
});

test("an unreadable file exits 2 after checking the rest", () => {
  const result = run([join(dir, "missing.yml"), broken]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing\.yml/);
  assert.match(result.stdout, /document start marker/);
});

test("no files is a usage error", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^usage: /);
});
