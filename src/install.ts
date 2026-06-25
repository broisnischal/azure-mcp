// ─── Install helpers — auto-configure MCP and skill ──────────────────────────

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";

const HOME = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "~";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const APPDATA = process.env["APPDATA"] ?? "";

// ── Paths ──────────────────────────────────────────────────────────────────────

const PATHS = {
  claudeCode: join(HOME, ".claude", "settings.json"),
  cursor: join(HOME, ".cursor", "mcp.json"),
  claudeDesktop: IS_MAC
    ? join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    : IS_WIN
    ? join(APPDATA, "Claude", "claude_desktop_config.json")
    : join(HOME, ".config", "Claude", "claude_desktop_config.json"),
  vscodeUser: IS_MAC
    ? join(HOME, "Library", "Application Support", "Code", "User", "settings.json")
    : IS_WIN
    ? join(APPDATA, "Code", "User", "settings.json")
    : join(HOME, ".config", "Code", "User", "settings.json"),
  skill: join(HOME, ".claude", "skills", "azure-board-mcp", "SKILL.md"),
};

// ── Skill content ──────────────────────────────────────────────────────────────

export const SKILL_CONTENT = `---
name: azure-board-mcp
description: Interact with Azure DevOps — work items, tasks, bugs, sprints, backlogs, pull requests, repositories, builds, and pipelines. Use when the user asks about ADO, Azure Boards, their tasks, sprint, backlog, a PR, build status, or anything in their Azure DevOps project.
---

# Azure DevOps (azure-board-mcp)

## Setup
If no project is active, call \`switch_project\` first — it lists all projects and remembers the choice.

## Tool quick-reference

| User asks | Call |
|---|---|
| My tasks / what should I work on | \`list_work_items\` mine=true |
| Current sprint / sprint board | \`list_work_items\` sprint=true |
| Specific ticket #123 | \`get_work_item\` id=123 |
| All active bugs / stories / epics | \`list_work_items\` type + state filters |
| Create a task / bug / story | \`create_work_item\` |
| Close / reassign / update a ticket | \`update_work_item\` |
| Comment on a ticket | \`add_comment\` |
| Link two tickets (parent, related) | \`link_work_items\` |
| Advanced query | \`query_wiql\` |
| Ordered product backlog | \`get_backlog\` |
| Who changed a ticket / audit trail | \`get_work_item_history\` id=123 |
| Valid area / iteration path values | \`list_paths\` kind="area" or "iteration" |
| Who's on the team | \`list_team_members\` |
| Kanban columns / board layout | \`get_board\` |
| Repos in the project | \`list_repos\` |
| Browse files | \`list_files\` → \`get_file\` |
| Recent commits | \`list_commits\` |
| Open PRs / reviewer status | \`list_pull_requests\` |
| Open a pull request | \`create_pr\` |
| Build status / CI health | \`list_builds\` |
| Why did a build fail | \`get_build_timeline\` (which step) → \`get_build_logs\` (output) |
| Stop a running build | \`cancel_build\` |
| Trigger a pipeline | \`list_pipelines\` → \`run_pipeline\` |
| Releases / deploy status | \`list_releases\`, \`create_release\` |
| Sprint dates / team capacity | \`get_sprint\` |

## Rules
- Never ask the user to type a project name — use \`switch_project\` (no args) to list, then switch.
- On 401 errors → call \`auth_status\` first.
- For list results prefer compact summaries; only call \`get_work_item\` when full detail is needed.
- Lists are paginated (default page 15, max 50) and report "Showing X–Y of N". To see more, call again with \`skip\` set to the last index shown — don't ask for a huge \`top\`.
- Before setting \`areaPath\`/\`iterationPath\` on create/update, get exact values from \`list_paths\`.
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function dirExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function readJson(p: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJson(p: string, obj: unknown): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}

const STDIO_ENTRY = { command: "npx", args: ["-y", "azure-board-mcp@latest"] };
const VSCODE_ENTRY = { type: "stdio", command: "npx", args: ["-y", "azure-board-mcp@latest"] };

type Result = "added" | "already" | "skipped";

async function injectMcpServers(filePath: string, key = "mcpServers"): Promise<Result> {
  if (key === "skip") return "skipped";
  const obj = await readJson(filePath);
  const servers = (obj[key] ?? {}) as Record<string, unknown>;
  if (servers["azure"]) return "already";
  servers["azure"] = STDIO_ENTRY;
  obj[key] = servers;
  await writeJson(filePath, obj);
  return "added";
}

async function injectVscode(filePath: string): Promise<Result> {
  const obj = await readJson(filePath);
  const mcp = (obj["mcp"] ?? {}) as Record<string, unknown>;
  const servers = (mcp["servers"] ?? {}) as Record<string, unknown>;
  if (servers["azure"]) return "already";
  servers["azure"] = VSCODE_ENTRY;
  mcp["servers"] = servers;
  obj["mcp"] = mcp;
  await writeJson(filePath, obj);
  return "added";
}

function icon(r: Result) {
  return r === "added" ? "✅" : r === "already" ? "⏭ " : "—";
}

// ── Commands ───────────────────────────────────────────────────────────────────

export async function cmdInstall(): Promise<void> {
  console.log("Configuring azure-board-mcp in detected AI editors...\n");

  const rows: Array<[string, string, Result]> = [];

  // Claude Code
  if (await dirExists(join(HOME, ".claude"))) {
    const r = await injectMcpServers(PATHS.claudeCode, "mcpServers");
    rows.push(["Claude Code", PATHS.claudeCode, r]);
  }

  // Cursor
  if (await dirExists(join(HOME, ".cursor"))) {
    const r = await injectMcpServers(PATHS.cursor, "mcpServers");
    rows.push(["Cursor", PATHS.cursor, r]);
  }

  // Claude Desktop
  if (await fileExists(PATHS.claudeDesktop)) {
    const r = await injectMcpServers(PATHS.claudeDesktop, "mcpServers");
    rows.push(["Claude Desktop", PATHS.claudeDesktop, r]);
  }

  // VS Code (only if settings file already exists — don't create it)
  if (await fileExists(PATHS.vscodeUser)) {
    const r = await injectVscode(PATHS.vscodeUser);
    rows.push(["VS Code", PATHS.vscodeUser, r]);
  }

  if (rows.length === 0) {
    console.log("No supported editors detected.\n");
    console.log("Manual config — add to your editor's MCP settings:");
    printManualConfig();
    return;
  }

  for (const [name, path, result] of rows) {
    const short = path.replace(HOME, "~");
    if (result === "added") console.log(`${icon(result)} ${name}  →  ${short}`);
    else if (result === "already") console.log(`${icon(result)} ${name}  (already configured)`);
  }

  // Install skill if Claude Code is present
  if (await dirExists(join(HOME, ".claude"))) {
    const r = await installSkillFile();
    if (r === "added") console.log(`✅ Claude skill  →  ${PATHS.skill.replace(HOME, "~")}`);
    else if (r === "already") console.log(`⏭  Claude skill  (already installed)`);
  }

  console.log("\nRestart your editor, then authenticate:");
  console.log("  npx azure-board-mcp authenticate\n");
}

export async function cmdInstallSkill(): Promise<void> {
  const r = await installSkillFile();
  if (r === "added") {
    console.log(`✅ Skill installed → ${PATHS.skill.replace(HOME, "~")}`);
    console.log("Restart Claude Code to activate.");
  } else if (r === "already") {
    console.log(`Skill already installed at ${PATHS.skill.replace(HOME, "~")}`);
    console.log("Remove it and re-run to update.");
  } else {
    console.log("~/.claude not found — is Claude Code installed?");
    console.log("Skill file content:\n");
    console.log(SKILL_CONTENT);
  }
}

async function installSkillFile(): Promise<Result> {
  if (!(await dirExists(join(HOME, ".claude")))) return "skipped";
  if (await fileExists(PATHS.skill)) return "already";
  await mkdir(dirname(PATHS.skill), { recursive: true });
  await writeFile(PATHS.skill, SKILL_CONTENT, { encoding: "utf8" });
  return "added";
}

function printManualConfig(): void {
  console.log(`
Claude Code  (~/.claude/settings.json):
  { "mcpServers": { "azure": { "command": "npx", "args": ["-y", "azure-board-mcp@latest"] } } }

Cursor  (~/.cursor/mcp.json):
  { "mcpServers": { "azure": { "command": "npx", "args": ["-y", "azure-board-mcp@latest"] } } }

VS Code  (User settings.json):
  { "mcp": { "servers": { "azure": { "type": "stdio", "command": "npx", "args": ["-y", "azure-board-mcp@latest"] } } } }

Claude Desktop  (claude_desktop_config.json):
  { "mcpServers": { "azure": { "command": "npx", "args": ["-y", "azure-board-mcp@latest"] } } }
`);
}
