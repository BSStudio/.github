import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readJson, run } from "./io.mjs";

const node = process.execPath;

test("resolves with the command's output and feeds it the input", async () => {
  assert.equal(await run(node, ["-e", "process.stdin.pipe(process.stdout)"], { input: "hello" }), "hello");
});

test("a failing command names the call and carries its error output", async () => {
  await assert.rejects(run(node, ["-e", "process.stderr.write('boom'); process.exit(3)"]), (error) => {
    assert.ok(error.message.includes("process.exit(3)"), error.message);
    assert.ok(error.message.endsWith(": boom"), error.message);
    return true;
  });
});

test("a command that fails silently reports its exit code", async () => {
  await assert.rejects(run(node, ["-e", "process.exit(4)"]), { message: /process\.exit\(4\): exited with code 4$/ });
});

test("a command that never finishes fails after the timeout", async () => {
  await assert.rejects(run(node, ["-e", "setInterval(() => {}, 1000)"], { timeout: 300 }), { message: /setInterval.*: timed out after 0\.3 s$/ });
});

test("a command that cannot start fails without crashing the run", async () => {
  await assert.rejects(run("no-such-command-for-io-test", [], { input: "x" }), { message: /^no-such-command-for-io-test: .*ENOENT/ });
});

test("reads JSON files relative to the repo root", () => {
  const expected = JSON.parse(readFileSync(new URL("../settings/repos.json", import.meta.url), "utf8"));
  assert.deepEqual(readJson("settings/repos.json"), expected);
});
