// ─── MCP Tool definitions & handlers ─────────────────────────────────────────

import type { AzureDevOpsClient, WorkItem } from "./client.ts";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

const ok = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });

function fail(e: unknown): CallToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  // Make common Azure API errors actionable
  let hint = "";
  if (msg.includes("401") || msg.includes("203")) hint = "\n\nHint: credentials may be expired — call auth_status to check.";
  else if (msg.includes("404")) hint = "\n\nHint: resource not found — verify the ID or name exists.";
  else if (msg.includes("No project selected")) hint = "\n\nHint: call switch_project to pick a project first.";
  else if (msg.includes("403")) hint = "\n\nHint: permission denied — check PAT scopes with auth_status.";
  return { content: [{ type: "text", text: `Error: ${msg}${hint}` }], isError: true };
}

function stripHtml(html: string): string {
  return html
    // Convert semantic elements to markdown equivalents
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "_$1_")
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n### ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract img src URLs from HTML, capped to avoid huge payloads. */
function extractImageUrls(html: string, max = 8): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && urls.length < max) {
    const src = m[1]!;
    if (src.startsWith("data:")) continue; // already inline, skip
    urls.push(src);
  }
  return urls;
}

// Compact summary used in list views
function fmtWI(wi: WorkItem): string {
  const f = wi.fields;
  const assigned =
    (f["System.AssignedTo"] as { displayName?: string } | undefined)?.displayName ?? "Unassigned";
  const lines = [
    `#${wi.id} — ${f["System.Title"]}`,
    `  Type:     ${f["System.WorkItemType"]}`,
    `  State:    ${f["System.State"]}`,
    `  Priority: ${f["Microsoft.VSTS.Common.Priority"] ?? "—"}`,
    `  Assigned: ${assigned}`,
    `  Sprint:   ${f["System.IterationPath"] ?? "—"}`,
    `  Pts:      ${f["Microsoft.VSTS.Scheduling.StoryPoints"] ?? "—"}`,
    `  Tags:     ${String(f["System.Tags"] || "—")}`,
    `  Updated:  ${f["System.ChangedDate"]}`,
  ];
  return lines.join("\n");
}

// Full detail view — used by get_work_item
function fmtWIFull(wi: WorkItem, comments: Array<{ createdBy: { displayName: string }; createdDate: string; text: string }>): string {
  const f = wi.fields;
  const dn = (key: string) =>
    (f[key] as { displayName?: string } | undefined)?.displayName ?? "—";

  const section = (title: string, body: string) =>
    body.trim() ? `\n## ${title}\n${body.trim()}` : "";

  // ── Core fields ────────────────────────────────────────────────────────────
  const core = [
    `# #${wi.id} — ${f["System.Title"]}`,
    ``,
    `Type:           ${f["System.WorkItemType"]}`,
    `State:          ${f["System.State"]}`,
    `Priority:       ${f["Microsoft.VSTS.Common.Priority"] ?? "—"}`,
    `Assigned to:    ${dn("System.AssignedTo")}`,
    `Area:           ${f["System.AreaPath"] ?? "—"}`,
    `Sprint:         ${f["System.IterationPath"] ?? "—"}`,
    `Tags:           ${String(f["System.Tags"] || "—")}`,
    `Story points:   ${f["Microsoft.VSTS.Scheduling.StoryPoints"] ?? "—"}`,
    `Remaining work: ${f["Microsoft.VSTS.Scheduling.RemainingWork"] ?? "—"} h`,
    `Original est.:  ${f["Microsoft.VSTS.Scheduling.OriginalEstimate"] ?? "—"} h`,
    `Completed work: ${f["Microsoft.VSTS.Scheduling.CompletedWork"] ?? "—"} h`,
    `Created by:     ${dn("System.CreatedBy")}  on  ${String(f["System.CreatedDate"] ?? "—").slice(0, 16)}`,
    `Last changed:   ${dn("System.ChangedBy")}  on  ${String(f["System.ChangedDate"] ?? "—").slice(0, 16)}`,
  ].join("\n");

  // ── Rich text fields ───────────────────────────────────────────────────────
  const description = f["System.Description"]
    ? stripHtml(String(f["System.Description"]))
    : "";
  const acceptance = f["Microsoft.VSTS.Common.AcceptanceCriteria"]
    ? stripHtml(String(f["Microsoft.VSTS.Common.AcceptanceCriteria"]))
    : "";
  const reproSteps = f["Microsoft.VSTS.TCM.ReproSteps"]
    ? stripHtml(String(f["Microsoft.VSTS.TCM.ReproSteps"]))
    : "";
  const systemInfo = f["Microsoft.VSTS.TCM.SystemInfo"]
    ? stripHtml(String(f["Microsoft.VSTS.TCM.SystemInfo"]))
    : "";

  // ── Relations ─────────────────────────────────────────────────────────────
  type Rel = { rel: string; url: string; attributes: Record<string, unknown> };
  const rels: Rel[] = (wi.relations ?? []) as Rel[];

  const wiIdFromUrl = (url: string) => url.split("/").pop() ?? url;

  const parents = rels.filter((r) => r.rel === "System.LinkTypes.Hierarchy-Reverse");
  const children = rels.filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward");
  const related = rels.filter((r) => r.rel === "System.LinkTypes.Related");
  const deps = rels.filter(
    (r) =>
      r.rel === "System.LinkTypes.Dependency-Forward" ||
      r.rel === "System.LinkTypes.Dependency-Reverse",
  );
  const artifacts = rels.filter((r) => r.rel === "ArtifactLink");
  const prs = artifacts.filter((r) => String(r.attributes["name"] ?? "").toLowerCase().includes("pull request"));
  const commits = artifacts.filter((r) => String(r.attributes["name"] ?? "").toLowerCase().includes("commit"));
  const builds = artifacts.filter((r) => String(r.attributes["name"] ?? "").toLowerCase().includes("build"));

  const fmtArtifact = (r: Rel) => {
    const name = String(r.attributes["name"] ?? "");
    const comment = String(r.attributes["comment"] ?? "");
    // Extract human-readable ID from vstfs URL
    const parts = r.url.replace("vstfs:///", "").split("/");
    const id = parts.at(-1) ?? r.url;
    return `  • ${name}  id:${id}${comment ? `  "${comment}"` : ""}`;
  };

  const relLines: string[] = [];
  if (parents.length) relLines.push(`Parent:   ${parents.map((r) => `#${wiIdFromUrl(r.url)}`).join(", ")}`);
  if (children.length) relLines.push(`Children: ${children.map((r) => `#${wiIdFromUrl(r.url)}`).join(", ")}`);
  if (related.length) relLines.push(`Related:  ${related.map((r) => `#${wiIdFromUrl(r.url)}`).join(", ")}`);
  if (deps.length) {
    relLines.push(
      ...deps.map(
        (r) =>
          `${r.rel === "System.LinkTypes.Dependency-Forward" ? "Successor" : "Predecessor"}: #${wiIdFromUrl(r.url)}`,
      ),
    );
  }

  const prSection = prs.length
    ? `Pull Requests (${prs.length}):\n${prs.map(fmtArtifact).join("\n")}`
    : "";
  const commitSection = commits.length
    ? `Commits (${commits.length}):\n${commits.map(fmtArtifact).join("\n")}`
    : "";
  const buildSection = builds.length
    ? `Builds (${builds.length}):\n${builds.map(fmtArtifact).join("\n")}`
    : "";

  const devLinks = [prSection, commitSection, buildSection].filter(Boolean).join("\n\n");

  // ── Comments ───────────────────────────────────────────────────────────────
  const commentBlock =
    comments.length === 0
      ? "No comments."
      : comments
          .map(
            (c) =>
              `[${c.createdDate.slice(0, 16)}] ${c.createdBy.displayName}\n${stripHtml(c.text)}`,
          )
          .join("\n\n");

  return [
    core,
    section("Description", description),
    section("Acceptance Criteria", acceptance),
    section("Repro Steps", reproSteps),
    section("System Info", systemInfo),
    relLines.length ? section("Linked Work Items", relLines.join("\n")) : "",
    devLinks ? section("Development & Deployment", devLinks) : "",
    section("Comments", commentBlock),
  ]
    .filter(Boolean)
    .join("\n");
}

const fmtList = (items: WorkItem[]) =>
  items.length === 0
    ? "No results."
    : `${items.length} item(s):\n\n${items.map(fmtWI).join("\n\n───\n\n")}`;

const str = (a: Record<string, unknown>, k: string) => a[k] as string;
const num = (a: Record<string, unknown>, k: string) => a[k] as number;
const opt = <T>(a: Record<string, unknown>, k: string): T | undefined =>
  a[k] != null ? (a[k] as T) : undefined;

// ═════════════════════════════════════════════════════════════════════════════
// Tools
// ═════════════════════════════════════════════════════════════════════════════

const WI_STATES = ["New", "Active", "Resolved", "Closed", "Done", "In Progress", "Removed"];
const WI_TYPES = ["Task", "Bug", "User Story", "Epic", "Feature", "Issue", "Test Case", "Test Plan"];
const PR_STATUSES = ["active", "completed", "abandoned", "all"];
const BUILD_STATUSES = ["all", "inProgress", "completed", "notStarted"];
const BUILD_RESULTS = ["succeeded", "failed", "canceled", "partiallySucceeded"];
const LINK_TYPES = [
  "System.LinkTypes.Hierarchy-Forward",   // parent → child
  "System.LinkTypes.Hierarchy-Reverse",   // child → parent
  "System.LinkTypes.Related",             // related
  "System.LinkTypes.Dependency-Forward",  // successor
  "System.LinkTypes.Dependency-Reverse",  // predecessor
];

export const TOOLS: Tool[] = [
  // ── Auth & Project ───────────────────────────────────────────────────────────
  {
    name: "auth_status",
    description:
      "Check auth health and available projects. Use when credentials may be expired (401 errors), to see which org/project is active, or to diagnose permission issues before calling other tools.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "switch_project",
    description:
      "List all Azure DevOps projects in the org and switch the active one. Use at the start of a session when no project is set, or when the user wants to work on a different project. Call with no arguments to list options.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name to switch to (omit to list all)" },
      },
    },
  },

  // ── Work Items ───────────────────────────────────────────────────────────────
  {
    name: "list_work_items",
    description:
      "Search and filter work items. Use for: 'show my tasks', 'what's in this sprint', 'find all active bugs', 'search for X'. Combine filters freely — mine+sprint+state. No filters returns the 20 most recently updated items.",
    inputSchema: {
      type: "object",
      properties: {
        mine: { type: "boolean", description: "Only items assigned to me (non-Closed)" },
        sprint: { type: "boolean", description: "Only items in the current sprint" },
        state: {
          type: "string",
          enum: WI_STATES,
          description: "Filter by state",
        },
        type: {
          type: "string",
          enum: WI_TYPES,
          description: "Filter by work item type",
        },
        keyword: { type: "string", description: "Full-text search across title and description" },
        top: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_work_item",
    description:
      "Get full detail for one work item by ID — all fields, description, acceptance criteria, repro steps, comments, linked PRs, commits, builds, and inline images. Use when the user asks to see or review a specific ticket.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "Work item ID" } },
      required: ["id"],
    },
  },
  {
    name: "create_work_item",
    description:
      "Create a new work item. Use when a user asks to create a task, bug, story, etc. type and title are required. For bugs include reproSteps. For user stories include acceptanceCriteria. Check list_work_items first to confirm sprint/area path values exist.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: WI_TYPES, description: "Work item type" },
        title: { type: "string" },
        description: { type: "string", description: "HTML or plain text description" },
        assignedTo: { type: "string", description: "Email or display name" },
        priority: {
          type: "number",
          enum: [1, 2, 3, 4],
          description: "1=Critical 2=High 3=Medium 4=Low",
        },
        state: { type: "string", enum: WI_STATES, description: "Initial state (default: New)" },
        iterationPath: { type: "string", description: "Sprint path e.g. MyProject\\Sprint 3" },
        areaPath: { type: "string", description: "Area path e.g. MyProject\\Backend" },
        parentId: { type: "number", description: "Parent work item ID" },
        storyPoints: { type: "number" },
        tags: { type: "string", description: "Semicolon-separated tags" },
        acceptanceCriteria: { type: "string", description: "User Story acceptance criteria" },
        reproSteps: { type: "string", description: "Bug repro steps" },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "update_work_item",
    description:
      "Update fields on an existing work item. Use to close a task, reassign, change state, move to a sprint, or update estimates. Only supply the fields you want to change — omitted fields are untouched. Use comment to append to the discussion thread.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        state: { type: "string", enum: WI_STATES },
        assignedTo: { type: "string", description: "Email, display name, or empty string to unassign" },
        priority: { type: "number", enum: [1, 2, 3, 4] },
        iterationPath: { type: "string" },
        areaPath: { type: "string" },
        storyPoints: { type: "number" },
        tags: { type: "string" },
        comment: { type: "string", description: "Append a discussion comment (markdown)" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_comment",
    description:
      "Post a discussion comment on a work item. Use when the user wants to leave a note, status update, or question on a ticket without changing any fields.",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: { type: "number" },
        text: { type: "string", description: "Comment body (markdown supported)" },
      },
      required: ["workItemId", "text"],
    },
  },
  {
    name: "link_work_items",
    description:
      "Create a relationship link between two work items. Use to set parent/child hierarchy, mark items as related, or specify predecessor/successor dependencies. sourceId → targetId in the direction of linkType.",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "number", description: "Work item to link from" },
        targetId: { type: "number", description: "Work item to link to" },
        linkType: {
          type: "string",
          enum: LINK_TYPES,
          description:
            "Hierarchy-Forward=parent→child, Hierarchy-Reverse=child→parent, Related=related, Dependency-Forward=successor, Dependency-Reverse=predecessor",
        },
        comment: { type: "string", description: "Optional comment for the link" },
      },
      required: ["sourceId", "targetId", "linkType"],
    },
  },
  {
    name: "query_wiql",
    description:
      "Run a raw WIQL query for advanced filtering not possible with list_work_items. Use for custom cross-field queries, date ranges, or complex logic. Example: SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.ChangedDate] >= @Today - 7",
    inputSchema: {
      type: "object",
      properties: {
        wiql: { type: "string", description: "WIQL query string" },
        top: { type: "number", description: "Max results (default 50)" },
      },
      required: ["wiql"],
    },
  },

  // ── Repositories ────────────────────────────────────────────────────────────
  {
    name: "list_repos",
    description:
      "List all Git repositories in the project with their default branch and remote URLs. Use to discover repo names before calling list_commits, list_pull_requests, get_file, or create_pr.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_commits",
    description:
      "List recent commits in a repository. Use when reviewing recent changes, finding who changed what, or auditing activity on a branch.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name or ID (use list_repos to find)" },
        branch: { type: "string", description: "Branch name (default: repo default branch)" },
        top: { type: "number", description: "Number of commits (default 20)" },
      },
      required: ["repo"],
    },
  },
  {
    name: "get_file",
    description:
      "Read the contents of a file from a repository. Use when reviewing code, reading config, checking a README, or understanding an implementation. Returns up to 500 lines.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name or ID" },
        path: { type: "string", description: "File path e.g. /src/index.ts or /README.md" },
        branch: { type: "string", description: "Branch name (default: repo default branch)" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "list_files",
    description:
      "List files and folders in a repository directory. Use to explore a repo's structure before reading specific files with get_file.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name or ID" },
        path: { type: "string", description: "Directory path (default: root /)" },
        branch: { type: "string", description: "Branch name (default: repo default branch)" },
      },
      required: ["repo"],
    },
  },
  {
    name: "list_pull_requests",
    description:
      "List pull requests in a repository. Use to review open PRs, check merge status, see reviewer votes, or find PRs by status. Default status is active.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name or ID" },
        status: {
          type: "string",
          enum: PR_STATUSES,
          description: "PR status filter (default: active)",
        },
      },
      required: ["repo"],
    },
  },
  {
    name: "create_pr",
    description:
      "Create a pull request in a repository. Use when a user asks to open a PR, submit code for review, or merge a branch. Use list_repos to get the repo ID first. sourceBranch is the feature branch; targetBranch is usually main or master.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name or ID" },
        title: { type: "string", description: "PR title" },
        sourceBranch: { type: "string", description: "Feature branch to merge from (e.g. feature/my-work)" },
        targetBranch: { type: "string", description: "Branch to merge into (default: main)" },
        description: { type: "string", description: "PR description (markdown)" },
        isDraft: { type: "boolean", description: "Create as draft (default: false)" },
        reviewers: {
          type: "array",
          items: { type: "string" },
          description: "Reviewer email addresses",
        },
        workItemIds: {
          type: "array",
          items: { type: "number" },
          description: "Work item IDs to link to this PR",
        },
      },
      required: ["repo", "title", "sourceBranch"],
    },
  },

  // ── Pipelines & Builds ───────────────────────────────────────────────────────
  {
    name: "list_pipelines",
    description:
      "List all CI/CD pipeline definitions in the project. Use to discover pipeline IDs before running run_pipeline or filtering list_builds.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_builds",
    description:
      "List recent CI/CD build runs with status, result, branch, duration, and a direct link. Use to check if builds are passing, diagnose failures, or see what's currently running.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "number", description: "Pipeline / definition ID (use list_pipelines)" },
        branch: { type: "string", description: "Branch filter e.g. refs/heads/main" },
        status: {
          type: "string",
          enum: BUILD_STATUSES,
          description: "Build status filter",
        },
        result: {
          type: "string",
          enum: BUILD_RESULTS,
          description: "Build result filter",
        },
        top: { type: "number", description: "Number of results (default 10)" },
      },
    },
  },
  {
    name: "run_pipeline",
    description:
      "Trigger a pipeline run. Use when a user asks to deploy, build, or run a CI/CD pipeline. Get the pipelineId from list_pipelines first.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "number", description: "Pipeline definition ID" },
        branch: { type: "string", description: "Branch to build (default: pipeline default)" },
        variables: {
          type: "object",
          description: "Key-value variables to pass to the pipeline",
          additionalProperties: { type: "string" },
        },
      },
      required: ["pipelineId"],
    },
  },
  {
    name: "get_build_logs",
    description:
      "Get the output logs of a build run. Returns the last 150 lines. Use to diagnose why a build failed. Get the buildId from list_builds first.",
    inputSchema: {
      type: "object",
      properties: {
        buildId: { type: "number", description: "Build run ID (from list_builds)" },
        logId: { type: "number", description: "Specific log ID (omit for the latest task log)" },
      },
      required: ["buildId"],
    },
  },

  // ── Sprints ──────────────────────────────────────────────────────────────────
  {
    name: "get_sprint",
    description:
      "Get the current sprint — name, start/end dates, and per-member capacity. Use when asked about the current sprint, planning remaining capacity, or checking sprint dates.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Team name (default: first team in project)" },
      },
    },
  },
  {
    name: "list_sprints",
    description:
      "List all sprints / iterations for a team with start and end dates. Use to plan future work, find a sprint path for create_work_item, or see the sprint history.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Team name (default: first team in project)" },
      },
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// Handler
// ═════════════════════════════════════════════════════════════════════════════

export async function handleTool(
  client: AzureDevOpsClient,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    switch (name) {
      // ── Auth ─────────────────────────────────────────────────────────────────
      case "auth_status": {
        if (!client.project) {
          const projects = await client.listProjects();
          return ok(
            [
              `Authenticated — org: ${client.org}`,
              `No project selected yet.`,
              ``,
              `Available projects (${projects.length}):`,
              ...projects.map((p, i) => `  ${i + 1}. ${p.name}${p.description ? `  — ${p.description}` : ""}`),
              ``,
              `Call switch_project(project: "<name>") to select one.`,
            ].join("\n"),
          );
        }
        const p = await client.checkPermissions();
        return ok(
          [
            `Org:     ${client.org}`,
            `Project: ${client.project}`,
            "",
            ...Object.entries(p.details).map(([k, v]) => `  ${v}  ${k}`),
            "",
            p.workItems
              ? "Work items: ok"
              : "Work items: FAILED — check PAT scopes at https://dev.azure.com/{org}/_usersSettings/tokens",
          ].join("\n"),
        );
      }

      case "switch_project": {
        const projects = await client.listProjects();
        const name = opt<string>(args, "project");
        if (!name) {
          return ok(
            [
              `Org: ${client.org}`,
              `Current project: ${client.project ?? "(none)"}`,
              ``,
              `Available projects (${projects.length}):`,
              ...projects.map((p, i) => `  ${i + 1}. ${p.name}${p.description ? `  — ${p.description}` : ""}`),
              ``,
              `Call switch_project(project: "<name>") to switch.`,
            ].join("\n"),
          );
        }
        const match = projects.find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        if (!match) {
          return ok(
            `Project "${name}" not found.\n\nAvailable:\n${projects.map((p) => `  • ${p.name}`).join("\n")}`,
          );
        }
        await client.setProject(match.name);
        return ok(`Switched to project: ${match.name}`);
      }

      // ── Work items ───────────────────────────────────────────────────────────
      case "list_work_items": {
        const keyword = opt<string>(args, "keyword");
        if (keyword) {
          return ok(
            fmtList(
              await client.searchWorkItems({
                keyword,
                state: opt(args, "state"),
                type: opt(args, "type"),
                top: opt<number>(args, "top") ?? 20,
              }),
            ),
          );
        }
        return ok(
          fmtList(
            await client.listWorkItems({
              assignedToMe: opt<boolean>(args, "mine"),
              currentSprint: opt<boolean>(args, "sprint"),
              state: opt(args, "state"),
              type: opt(args, "type"),
              top: opt<number>(args, "top") ?? 20,
            }),
          ),
        );
      }

      case "get_work_item": {
        const id = num(args, "id");
        const [wi, comments] = await Promise.all([
          client.getWorkItem(id),
          client.listComments(id).catch(() => []),
        ]);

        // Collect img URLs from all HTML fields
        const htmlFields = [
          wi.fields["System.Description"],
          wi.fields["Microsoft.VSTS.Common.AcceptanceCriteria"],
          wi.fields["Microsoft.VSTS.TCM.ReproSteps"],
          wi.fields["Microsoft.VSTS.TCM.SystemInfo"],
        ]
          .filter(Boolean)
          .map(String);

        const seenUrls = new Set<string>();
        const imgUrls: string[] = [];
        for (const html of htmlFields) {
          for (const u of extractImageUrls(html, 8)) {
            if (!seenUrls.has(u)) { seenUrls.add(u); imgUrls.push(u); }
            if (imgUrls.length >= 8) break;
          }
          if (imgUrls.length >= 8) break;
        }

        // Download images in parallel (best-effort — failures are silently dropped)
        const images = imgUrls.length
          ? (await Promise.all(imgUrls.map((u) => client.downloadAttachment(u)))).filter(Boolean)
          : [];

        const content: CallToolResult["content"] = [
          { type: "text", text: fmtWIFull(wi, comments) },
          ...images.map((img) => ({
            type: "image" as const,
            data: img!.data,
            mimeType: img!.mimeType,
          })),
        ];
        return { content };
      }

      case "create_work_item":
        return ok(
          `Created:\n\n${fmtWI(
            await client.createWorkItem({
              type: str(args, "type"),
              title: str(args, "title"),
              description: opt(args, "description"),
              assignedTo: opt(args, "assignedTo"),
              priority: opt(args, "priority"),
              tags: opt(args, "tags"),
              iterationPath: opt(args, "iterationPath"),
              areaPath: opt(args, "areaPath"),
              parentId: opt(args, "parentId"),
              state: opt(args, "state"),
              storyPoints: opt(args, "storyPoints"),
              acceptanceCriteria: opt(args, "acceptanceCriteria"),
              reproSteps: opt(args, "reproSteps"),
            }),
          )}`,
        );

      case "update_work_item":
        return ok(
          `Updated:\n\n${fmtWI(
            await client.updateWorkItem({
              id: num(args, "id"),
              title: opt(args, "title"),
              state: opt(args, "state"),
              assignedTo: opt(args, "assignedTo"),
              priority: opt(args, "priority"),
              iterationPath: opt(args, "iterationPath"),
              areaPath: opt(args, "areaPath"),
              storyPoints: opt(args, "storyPoints"),
              tags: opt(args, "tags"),
              comment: opt(args, "comment"),
            }),
          )}`,
        );

      case "add_comment": {
        const c = await client.addComment(num(args, "workItemId"), str(args, "text"));
        return ok(`Comment added by ${c.createdBy.displayName} at ${c.createdDate.slice(0, 16)}`);
      }

      case "link_work_items": {
        const wi = await client.linkWorkItems(
          num(args, "sourceId"),
          num(args, "targetId"),
          str(args, "linkType"),
          opt<string>(args, "comment"),
        );
        const relCount = wi.relations?.length ?? 0;
        return ok(
          `Linked #${num(args, "sourceId")} → #${num(args, "targetId")} (${str(args, "linkType").split(".").pop()})\nWork item #${wi.id} now has ${relCount} relation(s).`,
        );
      }

      case "query_wiql": {
        const r = await client.queryWiql(str(args, "wiql"), opt<number>(args, "top") ?? 50);
        if (r.workItems.length === 0) return ok("Query returned 0 results.");
        return ok(fmtList(await client.listWorkItemsById(r.workItems.map((w) => w.id))));
      }

      // ── Builds ───────────────────────────────────────────────────────────────
      case "list_builds": {
        type S = "all" | "inProgress" | "completed" | "cancelling" | "notStarted";
        type R = "succeeded" | "failed" | "canceled" | "partiallySucceeded";
        const builds = await client.listBuilds({
          pipelineId: opt<number>(args, "pipelineId"),
          branch: opt<string>(args, "branch"),
          status: opt<S>(args, "status"),
          result: opt<R>(args, "result"),
          top: opt<number>(args, "top") ?? 10,
        });
        if (builds.length === 0) return ok("No builds found.");
        return ok(
          builds
            .map((b) => {
              const dur =
                b.startTime && b.finishTime
                  ? `${Math.round((new Date(b.finishTime).getTime() - new Date(b.startTime).getTime()) / 60000)}m`
                  : "—";
              const icon =
                b.result === "succeeded" ? "✅"
                : b.result === "failed" ? "❌"
                : b.result === "canceled" ? "⏹"
                : b.status === "inProgress" ? "🔄"
                : "○";
              return [
                `${icon} #${b.id} ${b.buildNumber}`,
                `   Pipeline: ${b.definition.name}`,
                `   Branch:   ${b.sourceBranch.replace("refs/heads/", "")}`,
                `   Duration: ${dur}`,
                `   URL:      ${b._links.web.href}`,
              ].join("\n");
            })
            .join("\n\n"),
        );
      }

      // ── Pull requests ─────────────────────────────────────────────────────────
      case "list_pull_requests": {
        const prs = await client.listPullRequests(
          str(args, "repo"),
          (opt(args, "status") ?? "active") as "active" | "completed" | "abandoned" | "all",
        );
        if (prs.length === 0) return ok("No pull requests found.");
        return ok(
          prs
            .map((pr) =>
              [
                `#${pr.pullRequestId} [${pr.status}${pr.isDraft ? "/draft" : ""}] ${pr.title}`,
                `  By:     ${pr.createdBy.displayName}`,
                `  Branch: ${pr.sourceRefName.replace("refs/heads/", "")} → ${pr.targetRefName.replace("refs/heads/", "")}`,
                `  Merge:  ${pr.mergeStatus}`,
                pr.reviewers.length
                  ? `  Votes:  ${pr.reviewers.map((r) => `${r.displayName}:${r.vote > 0 ? "approved" : r.vote < 0 ? "rejected" : "pending"}`).join(", ")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n"),
        );
      }

      case "create_pr": {
        const pr = await client.createPullRequest({
          repoId: str(args, "repo"),
          title: str(args, "title"),
          sourceBranch: str(args, "sourceBranch"),
          targetBranch: opt<string>(args, "targetBranch") ?? "main",
          description: opt<string>(args, "description"),
          isDraft: opt<boolean>(args, "isDraft"),
          reviewers: opt<string[]>(args, "reviewers"),
          workItemIds: opt<number[]>(args, "workItemIds"),
        });
        return ok(
          [
            `Pull request created:`,
            `  #${pr.pullRequestId}  ${pr.title}`,
            `  ${pr.sourceRefName.replace("refs/heads/", "")} → ${pr.targetRefName.replace("refs/heads/", "")}`,
            `  Status: ${pr.status}${pr.isDraft ? " (draft)" : ""}`,
            pr.reviewers.length ? `  Reviewers: ${pr.reviewers.map((r) => r.displayName).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      // ── Repositories ────────────────────────────────────────────────────────
      case "list_repos": {
        const repos = await client.listRepositories();
        if (repos.length === 0) return ok("No repositories found.");
        return ok(
          `${repos.length} repositor${repos.length === 1 ? "y" : "ies"}:\n\n` +
          repos.map((r) => [
            `${r.name}`,
            `  ID:      ${r.id}`,
            `  Branch:  ${r.defaultBranch?.replace("refs/heads/", "") ?? "—"}`,
            `  Size:    ${r.size ? `${Math.round(r.size / 1024)} KB` : "—"}`,
            `  URL:     ${r.remoteUrl}`,
          ].join("\n")).join("\n\n"),
        );
      }

      case "list_commits": {
        const commits = await client.listCommits(
          str(args, "repo"),
          opt<string>(args, "branch"),
          opt<number>(args, "top") ?? 20,
        );
        if (commits.length === 0) return ok("No commits found.");
        return ok(
          commits.map((c) =>
            `${c.commitId.slice(0, 8)}  ${c.author.date.slice(0, 10)}  ${c.author.name}\n  ${c.comment.split("\n")[0]}`
          ).join("\n"),
        );
      }

      case "get_file": {
        const result = await client.getFileContent(
          str(args, "repo"),
          str(args, "path"),
          opt<string>(args, "branch"),
        );
        if (result.isBinary) return ok(`[Binary file: ${result.path}]`);
        const lines = result.content.split("\n");
        const header = `// ${result.path}${result.commitId ? `  @ ${result.commitId.slice(0, 8)}` : ""}\n\n`;
        // Cap at 500 lines to avoid flooding context
        const body = lines.length > 500
          ? lines.slice(0, 500).join("\n") + `\n\n... (${lines.length - 500} more lines — use a smaller file or specific range)`
          : result.content;
        return ok(header + body);
      }

      case "list_files": {
        const files = await client.listFiles(
          str(args, "repo"),
          opt<string>(args, "path") ?? "/",
          opt<string>(args, "branch"),
        );
        if (files.length === 0) return ok("Empty directory.");
        const dirs = files.filter((f) => f.isFolder);
        const srcs = files.filter((f) => !f.isFolder);
        const fmt = (f: { path: string; isFolder: boolean; size?: number }) => {
          const name = f.path.split("/").pop() ?? f.path;
          return f.isFolder ? `📁 ${name}/` : `   ${name}${f.size ? `  (${Math.round(f.size / 1024) || "<1"} KB)` : ""}`;
        };
        return ok([...dirs, ...srcs].map(fmt).join("\n"));
      }

      // ── Pipelines ────────────────────────────────────────────────────────────
      case "list_pipelines": {
        const pipelines = await client.listPipelines();
        if (pipelines.length === 0) return ok("No pipelines found.");
        return ok(
          `${pipelines.length} pipeline(s):\n\n` +
          pipelines.map((p) =>
            `#${p.id}  ${p.name}${p.folder && p.folder !== "\\" ? `  [${p.folder}]` : ""}`
          ).join("\n"),
        );
      }

      case "run_pipeline": {
        const build = await client.queueBuild(
          num(args, "pipelineId"),
          opt<string>(args, "branch"),
          opt<Record<string, string>>(args, "variables"),
        );
        return ok([
          `Pipeline triggered:`,
          `  Build #${build.id}  ${build.buildNumber}`,
          `  Pipeline: ${build.definition.name}`,
          `  Branch:   ${build.sourceBranch.replace("refs/heads/", "")}`,
          `  Status:   ${build.status}`,
          `  URL:      ${build._links.web.href}`,
        ].join("\n"));
      }

      case "get_build_logs": {
        const buildId = num(args, "buildId");
        const logId = opt<number>(args, "logId");
        if (logId != null) {
          const text = await client.getBuildLogContent(buildId, logId);
          const lines = text.split("\n");
          const tail = lines.slice(-150).join("\n");
          return ok(lines.length > 150 ? `... (${lines.length - 150} lines above)\n\n${tail}` : tail);
        }
        // No logId — list logs and return the last task log content
        const logs = await client.getBuildLogs(buildId);
        if (logs.length === 0) return ok("No logs available yet.");
        const last = logs[logs.length - 1]!;
        const text = await client.getBuildLogContent(buildId, last.id);
        const lines = text.split("\n");
        const tail = lines.slice(-150).join("\n");
        const header = `Build #${buildId} — log ${last.id}/${logs.length} (last 150 lines)\n\n`;
        return ok(header + (lines.length > 150 ? `... (${lines.length - 150} lines above)\n\n${tail}` : tail));
      }

      // ── Sprints ──────────────────────────────────────────────────────────────
      case "get_sprint": {
        const teams = await client.listTeams();
        const teamName = opt<string>(args, "team") ?? teams[0]?.name;
        if (!teamName) return ok("No teams found in this project.");
        const [sprint, capacities] = await Promise.all([
          client.getCurrentIteration(teamName),
          client.listTeamCapacities(teamName).catch(() => []),
        ]);
        if (!sprint) return ok(`No active sprint for team "${teamName}".`);
        const lines = [
          `Sprint: ${sprint.name}`,
          `Team:   ${teamName}`,
          `Start:  ${sprint.attributes.startDate?.slice(0, 10) ?? "—"}`,
          `End:    ${sprint.attributes.finishDate?.slice(0, 10) ?? "—"}`,
        ];
        if (capacities.length) {
          lines.push("", "Capacity:");
          for (const c of capacities) {
            const total = c.activities.reduce((s, a) => s + a.capacityPerDay, 0);
            lines.push(`  ${c.teamMember.displayName}  ${total}h/day`);
          }
        }
        return ok(lines.join("\n"));
      }

      case "list_sprints": {
        const teams = await client.listTeams();
        const teamName = opt<string>(args, "team") ?? teams[0]?.name;
        if (!teamName) return ok("No teams found in this project.");
        const iterations = await client.listIterations(teamName);
        if (iterations.length === 0) return ok("No sprints found.");
        return ok(
          `Sprints for "${teamName}" (${iterations.length}):\n\n` +
          iterations.map((it) => {
            const start = it.attributes.startDate?.slice(0, 10) ?? "—";
            const end = it.attributes.finishDate?.slice(0, 10) ?? "—";
            return `${it.name}  (${start} → ${end})`;
          }).join("\n"),
        );
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (e) {
    return fail(e);
  }
}
