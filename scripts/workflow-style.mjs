// Checks a workflow or composite action against the workflow convention (docs/workflows.md).
// The convention keeps files to a small YAML subset (2-space block style, no anchors, no flow
// maps, flow lists of at most one item), so an indentation-based reader is enough; anything
// outside that subset is reported rather than parsed.

const KEY = /^(?:"([^"]+)"|([A-Za-z_][\w.-]*)):(?:\s+(.*))?$/;
const BLOCK_SCALAR = /^[|>][+-]?\d*\s*(#.*)?$/;
const TOP_LEVEL_ORDER = ["name", "run-name", "on", "permissions", "concurrency", "defaults", "env", "jobs"];

const withoutComment = (value) => value.replace(/\s+#.*$/, "");

function parse(text) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const root = { line: 0, indent: -1, key: null, value: "", isItem: false, children: [], scalar: [] };
  const kinds = [null];
  const stack = [root];
  let scalarOwner = null;
  let pendingBlanks = [];

  for (const [index, raw] of lines.entries()) {
    const number = index + 1;
    const trimmed = raw.trim();
    const indent = raw.length - raw.trimStart().length;

    if (scalarOwner) {
      if (trimmed === "") {
        kinds.push("blank");
        pendingBlanks.push(number);
        continue;
      }
      if (indent > scalarOwner.indent) {
        for (const blank of pendingBlanks) kinds[blank] = "scalar";
        pendingBlanks = [];
        kinds.push("scalar");
        scalarOwner.scalar.push({ line: number, text: trimmed });
        continue;
      }
      scalarOwner = null;
    }
    pendingBlanks = [];

    if (trimmed === "") {
      kinds.push("blank");
      continue;
    }
    if (trimmed.startsWith("#")) {
      kinds.push("comment");
      continue;
    }
    const isDocument = /^---(\s+#.*)?$/.test(trimmed);
    kinds.push(isDocument ? "document" : "content");
    if (isDocument) continue;

    const isItem = trimmed === "-" || trimmed.startsWith("- ");
    while (stack.length > 1) {
      const top = stack.at(-1);
      // A sequence written at its parent key's indent still belongs to that key.
      const ownsItem = isItem && !top.isItem && top.indent === indent && top.value === "" && top.children.every((entry) => entry.isItem);
      if (top.indent < indent || ownsItem) break;
      stack.pop();
    }
    const parent = stack.at(-1);

    let node;
    if (isItem) {
      node = { line: number, indent, key: null, value: "", isItem: true, children: [], scalar: [] };
      parent.children.push(node);
      stack.push(node);
      const rest = trimmed.slice(1).trim();
      const match = KEY.exec(rest);
      if (match) {
        const child = keyNode(number, indent + 2, match);
        node.children.push(child);
        stack.push(child);
        node = child;
      } else {
        node.value = rest;
      }
    } else {
      const match = KEY.exec(trimmed);
      node = match ? keyNode(number, indent, match) : { line: number, indent, key: null, value: trimmed, isItem: false, children: [], scalar: [] };
      parent.children.push(node);
      stack.push(node);
    }
    if (node.block) scalarOwner = node;
  }

  setEndLines(root);
  return { root, kinds };
}

function keyNode(line, indent, match) {
  const raw = match[3] ?? "";
  const block = BLOCK_SCALAR.test(raw);
  return { line, indent, key: match[1] ?? match[2], raw, value: block ? "" : withoutComment(raw).trim(), block, isItem: false, children: [], scalar: [] };
}

function setEndLines(node) {
  let end = node.line;
  for (const entry of node.scalar) end = Math.max(end, entry.line);
  for (const child of node.children) end = Math.max(end, setEndLines(child));
  node.endLine = end;
  return end;
}

const child = (node, key) => node?.children.find((entry) => entry.key === key);
const keys = (node) => (node ? node.children.filter((entry) => entry.key !== null) : []);

function* walk(node) {
  for (const entry of node.children) {
    yield entry;
    yield* walk(entry);
  }
}

function blanksBetween(kinds, endLine, nextLine) {
  let count = 0;
  for (let line = endLine + 1; line < nextLine; line++) if (kinds[line] === "blank") count++;
  return count;
}

function blankAbove(kinds, line) {
  let above = line - 1;
  while (above > 0 && kinds[above] === "comment") above--;
  return above > 0 && kinds[above] === "blank";
}

function hasTopLevelComma(list) {
  let quote = null;
  for (const char of list.slice(1, -1)) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ",") {
      return true;
    }
  }
  return false;
}

function checkValues(root, report) {
  for (const node of walk(root)) {
    if (node.key === "<<") report(node.line, "anchors and aliases are not supported");
    const value = node.value;
    if (value) {
      if (value.startsWith("&") || value.startsWith("*")) report(node.line, "anchors and aliases are not supported");
      if (value.startsWith("{") && value !== "{}") report(node.line, "flow maps are not supported");
      if (value.startsWith("[") && hasTopLevelComma(value)) report(node.line, "flow lists hold at most one item");
      if (value.startsWith("'")) report(node.line, "use double quotes");
    }
    if (node.key === "if" && value) {
      if (value.includes("${{")) report(node.line, "if without ${{ }}");
      if (/\balways\(\)/.test(value)) report(node.line, "use !cancelled() instead of always()");
    }
    if (node.key === "run") {
      const message = "expression inside run; pass it through env";
      if (node.raw.includes("${{")) report(node.line, message);
      for (const entry of node.scalar) if (entry.text.includes("${{")) report(entry.line, message);
    }
  }
}

function checkSteps(steps, kinds, report, { allowShell, afterServices }) {
  const items = steps ? steps.children.filter((entry) => entry.isItem) : [];
  items.forEach((item, index) => {
    if (index > 0 && blanksBetween(kinds, items[index - 1].endLine, item.line) !== 1) report(item.line, "one empty line between steps");
    const stepKeys = keys(item);
    if (!stepKeys.some((entry) => entry.key === "name")) report(item.line, "step has no name");
    else if (stepKeys[0].key !== "name") report(item.line, "name must be the first key of a step");
    const run = stepKeys.findIndex((entry) => entry.key === "run");
    if (run >= 0 && run < stepKeys.length - 1) report(stepKeys[run + 1].line, "run must be the last key of a step");
    const shell = child(item, "shell");
    if (shell && !allowShell) report(shell.line, "no per-step shell");
  });
  if (!steps) return;
  if (afterServices) {
    if (blanksBetween(kinds, afterServices.endLine, steps.line) !== 1) report(steps.line, "one empty line between services and steps");
  } else if (blankAbove(kinds, steps.line)) report(steps.line, "no empty line before steps");
}

// Returns the services node when it sits right before steps, so the steps check knows to expect an empty line.
function checkServices(job, kinds, report) {
  const services = child(job, "services");
  if (!services) return null;
  const jobKeys = keys(job);
  const index = jobKeys.indexOf(services);
  if (blanksBetween(kinds, index > 0 ? jobKeys[index - 1].endLine : job.line, services.line) !== 1) report(services.line, "one empty line before services");
  if (jobKeys[index + 1]?.key === "steps") return services;
  report(services.line, "services must come right before steps");
  return null;
}

function checkTopLevel(root, kinds, report, { workflow }) {
  const top = keys(root);
  top.forEach((node, index) => {
    if (index > 0 && blanksBetween(kinds, top[index - 1].endLine, node.line) !== 1) report(node.line, "one empty line between top-level keys");
  });
  if (!workflow) return;
  let highest = -1;
  for (const node of top) {
    const rank = TOP_LEVEL_ORDER.indexOf(node.key);
    if (rank < 0) continue;
    if (rank < highest) report(node.line, `top-level key "${node.key}" out of order`);
    highest = Math.max(highest, rank);
  }
}

function checkWorkflowRules(root, kinds, report) {
  const permissions = child(root, "permissions");
  if (!permissions) report(1, "missing top-level permissions");
  else {
    if (permissions.value === "write-all") report(permissions.line, "top-level permissions must be read or none");
    for (const scope of keys(permissions)) if (scope.value === "write") report(scope.line, "top-level permissions must be read or none");
  }

  const on = child(root, "on");
  if (on) {
    if (on.value) report(on.line, "on must be a map");
    else if (child(on, "pull_request") && !child(root, "concurrency")) report(on.line, "missing concurrency for pull_request");
  }

  const jobs = keys(child(root, "jobs"));
  const hasRun = jobs.some((job) => (child(job, "steps")?.children ?? []).some((step) => child(step, "run")));
  if (hasRun && child(child(child(root, "defaults"), "run"), "shell")?.value !== "bash") report(1, "missing defaults.run.shell: bash");

  jobs.forEach((job, index) => {
    if (index > 0 && blanksBetween(kinds, jobs[index - 1].endLine, job.line) !== 1) report(job.line, "one empty line between jobs");
    if (!child(job, "name")) report(job.line, `job "${job.key}" has no name`);
    if (!child(job, "timeout-minutes") && !child(job, "uses")) report(job.line, `job "${job.key}" has no timeout-minutes`);
    checkSteps(child(job, "steps"), kinds, report, { allowShell: false, afterServices: checkServices(job, kinds, report) });
  });
}

export function checkWorkflow(text, path) {
  const findings = [];
  const report = (line, message) => findings.push({ path, line, message });
  const action = /(^|[\\/])action\.ya?ml$/.test(path);

  if (path.endsWith(".yaml")) report(1, "use the .yml extension");
  const { root, kinds } = parse(text);
  kinds.forEach((kind, line) => {
    if (kind === "document") report(line, "document start marker");
  });

  checkValues(root, report);
  checkTopLevel(root, kinds, report, { workflow: !action });
  if (action) checkSteps(child(child(root, "runs"), "steps"), kinds, report, { allowShell: true });
  else checkWorkflowRules(root, kinds, report);

  return findings.sort((a, b) => a.line - b.line || a.message.localeCompare(b.message));
}
