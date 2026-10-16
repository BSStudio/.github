// Side effects the CLIs share, kept out of the pure helpers.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

// The error names the command, so a failed run says which call failed; the timeout fails a stalled call instead of hanging the run.
export function run(command, args, { input, timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const exited = typeof error.code === "number" ? `exited with code ${error.code}` : error.message;
      const detail = error.killed ? `timed out after ${timeout / 1000} s` : stderr.trim() || exited;
      reject(new Error(`${[command, ...args].join(" ")}: ${detail}`));
    });
    // A command that fails to start closes stdin; the callback reports why.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

export const gh = (args, input) => run("gh", args, { input });

export const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
