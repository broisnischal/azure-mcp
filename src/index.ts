#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAuth, cmdAuthenticate, cmdCheck, cmdLogout } from "./auth.ts";
import { AzureDevOpsClient } from "./client.ts";
import { TOOLS, handleTool } from "./tools.ts";
import { cmdInstall, cmdInstallSkill } from "./install.ts";

const VERSION = "1.6.0";
const args = process.argv.slice(2);
const [cmd] = args;

const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
azure-board-mcp v${VERSION}
MCP server for Azure DevOps — work items, sprints, builds, and pull requests.

USAGE
  npx azure-board-mcp <command> [flags]

COMMANDS
  install               Auto-configure MCP in Claude Code, Cursor, VS Code, Claude Desktop
  skills                Install the Claude Code skill (AI learns when to use this MCP)
  authenticate          Sign in with Microsoft browser OAuth
  authenticate --pat    Sign in with a Personal Access Token
  check                 Validate stored credentials
  logout                Clear stored credentials
  help                  Show this help

AUTHENTICATE FLAGS
  --pat                 Use PAT instead of browser OAuth
  --read-only           Request read-only OAuth scopes
  --client-id <id>      Use your own Azure AD app
  --tenant-id <id>      Specify tenant (single-tenant apps only)

QUICK START
  1. npx azure-board-mcp install        # configure MCP in your editors
  2. npx azure-board-mcp authenticate   # sign in once
  3. Restart your editor — done

Credentials stored at ~/.azure-mcp-auth.json
Docs: https://github.com/broisnischal/azure-mcp
`);
}

// ── CLI commands ──────────────────────────────────────────────────────────────

if (cmd === "help" || flag("--help") || flag("-h")) {
  printHelp();
  process.exit(0);
}

if (flag("--version") || flag("-v")) {
  console.log(VERSION);
  process.exit(0);
}

if (cmd === "install" || cmd === "setup") {
  await cmdInstall();
  process.exit(0);
}

if (cmd === "skills" || cmd === "skill") {
  await cmdInstallSkill();
  process.exit(0);
}

if (cmd === "authenticate" || cmd === "auth") {
  await cmdAuthenticate({
    pat: flag("--pat"),
    readOnly: flag("--read-only"),
    clientId: option("--client-id"),
    tenantId: option("--tenant-id"),
  });
  process.exit(0);
}

if (cmd === "check") {
  await cmdCheck();
  process.exit(0);
}

if (cmd === "logout") {
  await cmdLogout();
  process.exit(0);
}

if (cmd && cmd !== "") {
  console.error(`Unknown command: "${cmd}"\nRun "npx azure-board-mcp help" for usage.`);
  process.exit(1);
}

// ── MCP server ────────────────────────────────────────────────────────────────

const auth = await loadAuth();
if (!auth) {
  console.error(
    [
      "Not authenticated. Run:",
      "",
      "  npx azure-board-mcp authenticate       (browser sign-in)",
      "  npx azure-board-mcp authenticate --pat (Personal Access Token)",
      "",
      "Or set env vars: AZURE_ORG, AZURE_PROJECT, AZURE_PAT",
    ].join("\n"),
  );
  process.exit(1);
}

const client = new AzureDevOpsClient(auth);

// Pre-warm cache in background — don't block server startup
Promise.resolve().then(async () => {
  try {
    const teams = await client.listTeams();
    if (teams[0]) {
      await Promise.all([
        client.getCurrentIteration(teams[0].name),
        client.listWorkItems({ assignedToMe: true, top: 5 }),
      ]);
    }
  } catch { /* ignore — cache pre-warm is best-effort */ }
});

const server = new Server(
  { name: "azure-board-mcp", version: VERSION },
  { capabilities: { tools: {}, prompts: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  return handleTool(client, name, a as Record<string, unknown>);
});

// ── Prompts ────────────────────────────────────────────────────────────────────

const PROMPTS = [
  {
    name: "plan-sprint",
    description: "Review the current sprint — capacity, assigned work, and unassigned items.",
    arguments: [{ name: "team", description: "Team name (optional)", required: false }],
  },
  {
    name: "daily-standup",
    description: "Show what I worked on yesterday, what I'm doing today, and any blockers.",
    arguments: [],
  },
  {
    name: "triage-bugs",
    description: "List all active bugs sorted by priority, with full details for the top 3.",
    arguments: [],
  },
  {
    name: "review-pr",
    description: "List open PRs for a repository and show their reviewer status.",
    arguments: [{ name: "repo", description: "Repository name", required: true }],
  },
];

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  const proj = auth.project ?? "(no project — call switch_project first)";

  switch (name) {
    case "plan-sprint": {
      const team = (a as Record<string, string>)["team"] ? ` for team "${(a as Record<string, string>)["team"]}"` : "";
      return {
        description: PROMPTS[0]!.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Use the azure MCP tools to plan the current sprint${team} in project "${proj}":
1. Call get_sprint to see dates and team capacity
2. Call list_work_items with sprint=true to see all sprint items
3. Summarize: total items, by state, by assignee, any unassigned items, capacity vs story points`,
          },
        }],
      };
    }
    case "daily-standup": {
      return {
        description: PROMPTS[1]!.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Use the azure MCP tools for a daily standup in project "${proj}":
1. Call list_work_items with mine=true to get my open items
2. For each item state=Active or state=In Progress, note what changed recently
3. List items I completed (state=Resolved or state=Done) recently
4. Format as: Yesterday / Today / Blockers`,
          },
        }],
      };
    }
    case "triage-bugs": {
      return {
        description: PROMPTS[2]!.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Use the azure MCP tools to triage bugs in project "${proj}":
1. Call list_work_items with type="Bug" and state="Active" to get all active bugs
2. Sort by priority (1=Critical first)
3. Call get_work_item for the top 3 highest priority bugs
4. Summarize each with: severity, repro steps, who it's assigned to, how long it's been open`,
          },
        }],
      };
    }
    case "review-pr": {
      const repo = (a as Record<string, string>)["repo"] ?? "";
      return {
        description: PROMPTS[3]!.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Use the azure MCP tools to review pull requests${repo ? ` in repo "${repo}"` : ""} in project "${proj}":
1. Call list_pull_requests with repo="${repo || "<repo-name>"}" and status="active"
2. For each PR show: title, author, source→target branch, reviewer votes (approved/pending/rejected)
3. Flag any PRs with no reviewers or with rejected votes`,
          },
        }],
      };
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ── Resources ──────────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: auth.project
    ? [
        {
          uri: `azure://sprint/current`,
          name: "Current Sprint",
          description: "Active sprint dates and work items",
          mimeType: "text/plain",
        },
        {
          uri: `azure://workitems/mine`,
          name: "My Work Items",
          description: "All open work items assigned to me",
          mimeType: "text/plain",
        },
        {
          uri: `azure://builds/recent`,
          name: "Recent Builds",
          description: "Last 10 CI/CD build runs",
          mimeType: "text/plain",
        },
      ]
    : [],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  switch (uri) {
    case "azure://sprint/current": {
      const teams = await client.listTeams();
      const team = teams[0]?.name;
      if (!team) return { contents: [{ uri, mimeType: "text/plain", text: "No teams found." }] };
      const [sprint, items] = await Promise.all([
        client.getCurrentIteration(team),
        client.listWorkItems({ currentSprint: true, top: 50 }),
      ]);
      const lines = sprint
        ? [
            `Sprint: ${sprint.name}`,
            `  ${sprint.attributes.startDate?.slice(0, 10) ?? "?"} → ${sprint.attributes.finishDate?.slice(0, 10) ?? "?"}`,
            `  ${items.length} work item(s)`,
          ]
        : ["No active sprint."];
      return { contents: [{ uri, mimeType: "text/plain", text: lines.join("\n") }] };
    }
    case "azure://workitems/mine": {
      const items = await client.listWorkItems({ assignedToMe: true, top: 30 });
      const text = items.length === 0
        ? "No open items assigned to you."
        : items.map((w) => `#${w.id} [${w.fields["System.State"]}] ${w.fields["System.Title"]}`).join("\n");
      return { contents: [{ uri, mimeType: "text/plain", text }] };
    }
    case "azure://builds/recent": {
      const builds = await client.listBuilds({ top: 10 });
      const text = builds.length === 0
        ? "No builds found."
        : builds.map((b) => `#${b.id} ${b.status === "inProgress" ? "🔄" : b.result === "succeeded" ? "✅" : b.result === "failed" ? "❌" : "○"} ${b.definition.name} ${b.sourceBranch.replace("refs/heads/", "")}`).join("\n");
      return { contents: [{ uri, mimeType: "text/plain", text }] };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(
  `azure-board-mcp v${VERSION} ready — ${auth.org}${auth.project ? ` / ${auth.project}` : " (no project — call switch_project)"}`,
);
