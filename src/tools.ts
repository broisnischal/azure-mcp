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

// Compact one-line summary used in list views
function fmtWI(wi: WorkItem): string {
  const f = wi.fields;
  const assigned = (f["System.AssignedTo"] as { displayName?: string } | undefined)?.displayName ?? "—";
  const sprint = String(f["System.IterationPath"] ?? "").split("\\").pop() ?? "—";
  const pts = f["Microsoft.VSTS.Scheduling.StoryPoints"];
  const pri = f["Microsoft.VSTS.Common.Priority"];
  const meta = [
    assigned !== "—" ? `@${assigned}` : null,
    sprint !== "—" ? sprint : null,
    pts != null ? `${pts}pts` : null,
    pri != null ? `P${pri}` : null,
  ].filter(Boolean).join(" · ");
  return `#${wi.id} [${f["System.WorkItemType"]}/${f["System.State"]}] ${f["System.Title"]}${meta ? `  — ${meta}` : ""}`;
}

const TRUNC = 800; // max chars for long text fields

function trunc(text: string): string {
  return text.length > TRUNC ? text.slice(0, TRUNC) + `\n…(${text.length - TRUNC} more chars)` : text;
}

// Full detail view — used by get_work_item
function fmtWIFull(wi: WorkItem, comments: Array<{ createdBy: { displayName: string }; createdDate: string; text: string }>): string {
  const f = wi.fields;
  const dn = (key: string) =>
    (f[key] as { displayName?: string } | undefined)?.displayName ?? "";

  const section = (title: string, body: string) =>
    body.trim() ? `\n## ${title}\n${body.trim()}` : "";

  // Only include non-empty core fields
  const row = (label: string, val: unknown) =>
    val != null && val !== "" && val !== 0 ? `${label}: ${val}` : "";

  const core = [
    `# #${wi.id} — ${f["System.Title"]}`,
    ``,
    row("Type",    f["System.WorkItemType"]),
    row("State",   f["System.State"]),
    row("Priority", f["Microsoft.VSTS.Common.Priority"]),
    row("Assigned", dn("System.AssignedTo")),
    row("Area",    f["System.AreaPath"]),
    row("Sprint",  f["System.IterationPath"]),
    row("Tags",    f["System.Tags"]),
    row("Points",  f["Microsoft.VSTS.Scheduling.StoryPoints"]),
    row("Remaining", f["Microsoft.VSTS.Scheduling.RemainingWork"] != null ? `${f["Microsoft.VSTS.Scheduling.RemainingWork"]}h` : null),
    row("Estimate",  f["Microsoft.VSTS.Scheduling.OriginalEstimate"] != null ? `${f["Microsoft.VSTS.Scheduling.OriginalEstimate"]}h` : null),
    row("Completed", f["Microsoft.VSTS.Scheduling.CompletedWork"] != null ? `${f["Microsoft.VSTS.Scheduling.CompletedWork"]}h` : null),
    `Created: ${dn("System.CreatedBy")} · ${String(f["System.CreatedDate"] ?? "").slice(0, 10)}`,
    `Updated: ${dn("System.ChangedBy")} · ${String(f["System.ChangedDate"] ?? "").slice(0, 10)}`,
  ].filter(Boolean).join("\n");

  // ── Rich text fields (truncated to keep context lean) ─────────────────────
  const description = f["System.Description"]
    ? trunc(stripHtml(String(f["System.Description"])))
    : "";
  const acceptance = f["Microsoft.VSTS.Common.AcceptanceCriteria"]
    ? trunc(stripHtml(String(f["Microsoft.VSTS.Common.AcceptanceCriteria"])))
    : "";
  const reproSteps = f["Microsoft.VSTS.TCM.ReproSteps"]
    ? trunc(stripHtml(String(f["Microsoft.VSTS.TCM.ReproSteps"])))
    : "";
  const systemInfo = f["Microsoft.VSTS.TCM.SystemInfo"]
    ? trunc(stripHtml(String(f["Microsoft.VSTS.TCM.SystemInfo"])))
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

  // ── Comments (last 5 only to keep context lean) ───────────────────────────
  const recentComments = comments.slice(-5);
  const commentBlock =
    comments.length === 0
      ? "No comments."
      : (comments.length > 5 ? `(${comments.length - 5} earlier comments omitted)\n\n` : "") +
        recentComments
          .map((c) => `[${c.createdDate.slice(0, 10)}] ${c.createdBy.displayName}\n${trunc(stripHtml(c.text))}`)
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

/** Hard ceiling on page size so a single call can't flood context. */
const MAX_PAGE = 50;
const DEFAULT_PAGE = 15;

/** Clamp a user-supplied page size into [1, MAX_PAGE]. */
function pageSize(top: number | undefined): number {
  if (top == null) return DEFAULT_PAGE;
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(top)));
}

/**
 * Render a page of work items with a "showing X–Y of N" header and a next-page
 * hint, so the model can fetch more deliberately instead of dumping everything.
 */
function fmtPage(
  items: WorkItem[],
  total: number,
  skip: number,
  capped = false,
): string {
  if (total === 0) return "No results.";
  const start = skip + 1;
  const end = skip + items.length;
  const totalLabel = capped ? `${total}+` : `${total}`;
  const header = `Showing ${start}–${end} of ${totalLabel}`;
  const body = items.map(fmtWI).join("\n\n───\n\n");
  const more =
    end < total
      ? `\n\n— ${capped ? "more" : `${total - end} more`} available. Call again with skip: ${end} for the next page.`
      : "";
  return `${header}:\n\n${body}${more}`;
}

/**
 * Wrap a pre-formatted list body with a "showing X–Y" header and a next-page
 * hint for endpoints that page by offset but don't return a total (commits,
 * PRs). A full page implies more may exist; a short page is the end.
 */
function fmtOffsetPage(body: string, count: number, skip: number, top: number): string {
  const header = `Showing ${skip + 1}–${skip + count}`;
  const more =
    count >= top ? `\n\n— more may be available. Call again with skip: ${skip + count}.` : "";
  return `${header}:\n\n${body}${more}`;
}

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
const RELEASE_STATUSES = ["draft", "active", "abandoned"];
const LINK_TYPES = [
  "System.LinkTypes.Hierarchy-Forward",   // parent → child
  "System.LinkTypes.Hierarchy-Reverse",   // child → parent
  "System.LinkTypes.Related",             // related
  "System.LinkTypes.Dependency-Forward",  // successor
  "System.LinkTypes.Dependency-Reverse",  // predecessor
];

export const TOOLS: Tool[] = [
  {
    name: "auth_status",
    description: "Check credentials and list available projects. Call on 401 errors.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "switch_project",
    description: "List all projects or switch the active one. Call first if no project is set.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string", description: "Project name (omit to list all)" } },
    },
  },
  {
    name: "list_work_items",
    description: "List/search work items. Filters: mine, sprint, state, type, keyword.",
    inputSchema: {
      type: "object",
      properties: {
        mine: { type: "boolean", description: "Only my open items" },
        sprint: { type: "boolean", description: "Only current sprint items" },
        state: { type: "string", enum: WI_STATES },
        type: { type: "string", enum: WI_TYPES },
        keyword: { type: "string", description: "Search title and description" },
        top: { type: "number", description: "Page size (default 15, max 50)" },
        skip: { type: "number", description: "Skip N results for pagination (default 0)" },
      },
    },
  },
  {
    name: "get_work_item",
    description: "Get full detail for one work item — fields, comments, linked PRs/builds.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Work item ID" },
        images: { type: "boolean", description: "Include inline images (slow, large — default false)" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_work_item",
    description: "Create a work item (task, bug, story, epic, etc).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: WI_TYPES },
        title: { type: "string" },
        description: { type: "string" },
        assignedTo: { type: "string", description: "Email or display name" },
        priority: { type: "number", enum: [1, 2, 3, 4], description: "1=Critical 4=Low" },
        state: { type: "string", enum: WI_STATES },
        iterationPath: { type: "string", description: "Sprint path" },
        areaPath: { type: "string" },
        parentId: { type: "number" },
        storyPoints: { type: "number" },
        tags: { type: "string", description: "Semicolon-separated" },
        acceptanceCriteria: { type: "string" },
        reproSteps: { type: "string", description: "Bug only" },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "update_work_item",
    description: "Update fields on a work item. Only supply fields to change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        state: { type: "string", enum: WI_STATES },
        assignedTo: { type: "string", description: "Empty string to unassign" },
        priority: { type: "number", enum: [1, 2, 3, 4] },
        iterationPath: { type: "string" },
        areaPath: { type: "string" },
        storyPoints: { type: "number" },
        tags: { type: "string" },
        comment: { type: "string", description: "Append a discussion comment" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_comment",
    description: "Post a discussion comment on a work item.",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: { type: "number" },
        text: { type: "string" },
      },
      required: ["workItemId", "text"],
    },
  },
  {
    name: "link_work_items",
    description: "Link two work items (parent/child, related, dependency).",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "number" },
        targetId: { type: "number" },
        linkType: { type: "string", enum: LINK_TYPES },
        comment: { type: "string" },
      },
      required: ["sourceId", "targetId", "linkType"],
    },
  },
  {
    name: "query_wiql",
    description: "Run a raw WIQL query for advanced filtering.",
    inputSchema: {
      type: "object",
      properties: {
        wiql: { type: "string" },
        top: { type: "number", description: "Page size (default 15, max 50)" },
        skip: { type: "number", description: "Skip N results for pagination (default 0)" },
      },
      required: ["wiql"],
    },
  },
  {
    name: "list_repos",
    description: "List all Git repositories in the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_commits",
    description: "List recent commits in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        branch: { type: "string" },
        top: { type: "number", description: "Page size (default 20, max 50)" },
        skip: { type: "number", description: "Skip N commits for pagination (default 0)" },
      },
      required: ["repo"],
    },
  },
  {
    name: "get_file",
    description: "Read a file from a repository (up to 500 lines).",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        path: { type: "string", description: "e.g. /src/index.ts" },
        branch: { type: "string" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "list_files",
    description: "List files/folders in a repository directory.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        path: { type: "string", description: "Directory path (default: /)" },
        branch: { type: "string" },
      },
      required: ["repo"],
    },
  },
  {
    name: "list_pull_requests",
    description: "List pull requests with status, branch, and reviewer votes.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        status: { type: "string", enum: PR_STATUSES, description: "Default: active" },
        top: { type: "number", description: "Page size (default 20, max 50)" },
        skip: { type: "number", description: "Skip N PRs for pagination (default 0)" },
      },
      required: ["repo"],
    },
  },
  {
    name: "create_pr",
    description: "Create a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string" },
        title: { type: "string" },
        sourceBranch: { type: "string" },
        targetBranch: { type: "string", description: "Default: main" },
        description: { type: "string" },
        isDraft: { type: "boolean" },
        reviewers: { type: "array", items: { type: "string" }, description: "Email addresses" },
        workItemIds: { type: "array", items: { type: "number" } },
      },
      required: ["repo", "title", "sourceBranch"],
    },
  },
  {
    name: "list_pipelines",
    description: "List all CI/CD pipeline definitions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_builds",
    description: "List recent build runs with status, result, and link.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "number" },
        branch: { type: "string" },
        status: { type: "string", enum: BUILD_STATUSES },
        result: { type: "string", enum: BUILD_RESULTS },
        top: { type: "number", description: "Default 10" },
      },
    },
  },
  {
    name: "run_pipeline",
    description: "Trigger a pipeline run.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "number" },
        branch: { type: "string" },
        variables: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["pipelineId"],
    },
  },
  {
    name: "get_build_logs",
    description: "Get build output logs (last 80 lines) to diagnose failures.",
    inputSchema: {
      type: "object",
      properties: {
        buildId: { type: "number" },
        logId: { type: "number", description: "Specific log (omit for latest)" },
      },
      required: ["buildId"],
    },
  },
  {
    name: "get_sprint",
    description: "Get current sprint — name, dates, and team capacity.",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string", description: "Default: first team" } },
    },
  },
  {
    name: "list_sprints",
    description: "List all sprints with start/end dates.",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string", description: "Default: first team" } },
    },
  },
  {
    name: "get_backlog",
    description: "Show the ordered product backlog (priority-ranked work items).",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Default: first team" },
        level: { type: "string", description: "Backlog level (e.g. Microsoft.RequirementCategory, Microsoft.EpicCategory). Omit for default." },
        top: { type: "number", description: "Page size (default 20, max 50)" },
        skip: { type: "number", description: "Skip N for pagination (default 0)" },
      },
    },
  },
  {
    name: "get_work_item_history",
    description: "Show the change history of a work item — what fields changed, when, and by whom.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Work item ID" },
        top: { type: "number", description: "Most recent N revisions (default 15)" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_team_members",
    description: "List members of a team (display name, email, admin flag).",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string", description: "Default: first team" } },
    },
  },
  {
    name: "list_paths",
    description: "List area or iteration paths — use these exact values for areaPath/iterationPath on create/update.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["area", "iteration"], description: "Which path tree to list" },
      },
      required: ["kind"],
    },
  },
  {
    name: "get_board",
    description: "Show a team's Kanban board columns and their state mappings.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Default: first team" },
        board: { type: "string", description: "Board name/id (omit for first board)" },
      },
    },
  },
  {
    name: "get_build_timeline",
    description: "Show a build's step-by-step timeline — which stage/job/task failed, with error/warning counts.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" } },
      required: ["buildId"],
    },
  },
  {
    name: "cancel_build",
    description: "Cancel an in-progress build run.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" } },
      required: ["buildId"],
    },
  },
  {
    name: "list_releases",
    description: "List recent releases with environment deployment status.",
    inputSchema: {
      type: "object",
      properties: {
        definitionId: { type: "number", description: "Filter by release definition" },
        status: { type: "string", enum: RELEASE_STATUSES },
        top: { type: "number", description: "Default 10" },
      },
    },
  },
  {
    name: "create_release",
    description: "Create (and trigger) a release from a release definition.",
    inputSchema: {
      type: "object",
      properties: {
        definitionId: { type: "number" },
        description: { type: "string" },
      },
      required: ["definitionId"],
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
        const top = pageSize(opt<number>(args, "top"));
        const skip = Math.max(0, opt<number>(args, "skip") ?? 0);
        const wiql = keyword
          ? client.buildSearchWiql({ keyword, state: opt(args, "state"), type: opt(args, "type") })
          : client.buildListWiql({
              assignedToMe: opt<boolean>(args, "mine"),
              currentSprint: opt<boolean>(args, "sprint"),
              state: opt(args, "state"),
              type: opt(args, "type"),
            });
        const { items, total, capped } = await client.pagedWorkItems(wiql, { skip, top });
        return ok(fmtPage(items, total, skip, capped));
      }

      case "get_work_item": {
        const id = num(args, "id");
        const includeImages = opt<boolean>(args, "images") ?? false;
        const [wi, comments] = await Promise.all([
          client.getWorkItem(id),
          client.listComments(id).catch(() => []),
        ]);

        const content: CallToolResult["content"] = [
          { type: "text", text: fmtWIFull(wi, comments) },
        ];

        // Images are opt-in — they're large and slow to download
        if (includeImages) {
          const htmlFields = [
            wi.fields["System.Description"],
            wi.fields["Microsoft.VSTS.Common.AcceptanceCriteria"],
            wi.fields["Microsoft.VSTS.TCM.ReproSteps"],
          ].filter(Boolean).map(String);

          const imgUrls: string[] = [];
          const seen = new Set<string>();
          for (const html of htmlFields) {
            for (const u of extractImageUrls(html, 4)) {
              if (!seen.has(u)) { seen.add(u); imgUrls.push(u); }
              if (imgUrls.length >= 4) break;
            }
          }
          const images = (await Promise.all(imgUrls.map((u) => client.downloadAttachment(u)))).filter(Boolean);
          content.push(...images.map((img) => ({ type: "image" as const, data: img!.data, mimeType: img!.mimeType })));
        }

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
        const top = pageSize(opt<number>(args, "top"));
        const skip = Math.max(0, opt<number>(args, "skip") ?? 0);
        const { items, total, capped } = await client.pagedWorkItems(str(args, "wiql"), { skip, top });
        if (total === 0) return ok("Query returned 0 results.");
        return ok(fmtPage(items, total, skip, capped));
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
        const top = pageSize(opt<number>(args, "top") ?? 20);
        const skip = Math.max(0, opt<number>(args, "skip") ?? 0);
        const prs = await client.listPullRequests(
          str(args, "repo"),
          (opt(args, "status") ?? "active") as "active" | "completed" | "abandoned" | "all",
          top,
          skip,
        );
        if (prs.length === 0) return ok(skip > 0 ? "No more pull requests." : "No pull requests found.");
        const body = prs
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
          .join("\n\n");
        return ok(fmtOffsetPage(body, prs.length, skip, top));
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
        const top = pageSize(opt<number>(args, "top") ?? 20);
        const skip = Math.max(0, opt<number>(args, "skip") ?? 0);
        const commits = await client.listCommits(
          str(args, "repo"),
          opt<string>(args, "branch"),
          top,
          skip,
        );
        if (commits.length === 0) return ok(skip > 0 ? "No more commits." : "No commits found.");
        const body = commits.map((c) =>
          `${c.commitId.slice(0, 8)}  ${c.author.date.slice(0, 10)}  ${c.author.name}\n  ${c.comment.split("\n")[0]}`
        ).join("\n");
        return ok(fmtOffsetPage(body, commits.length, skip, top));
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
          const tail = lines.slice(-80).join("\n");
          return ok(lines.length > 80 ? `... (${lines.length - 80} lines above)\n\n${tail}` : tail);
        }
        // No logId — list logs and return the last task log content
        const logs = await client.getBuildLogs(buildId);
        if (logs.length === 0) return ok("No logs available yet.");
        const last = logs[logs.length - 1]!;
        const text = await client.getBuildLogContent(buildId, last.id);
        const lines = text.split("\n");
        const tail = lines.slice(-80).join("\n");
        const header = `Build #${buildId} — log ${last.id}/${logs.length} (last 80 lines)\n\n`;
        return ok(header + (lines.length > 80 ? `... (${lines.length - 80} lines above)\n\n${tail}` : tail));
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

      // ── Backlog ────────────────────────────────────────────────────────────
      case "get_backlog": {
        const teams = await client.listTeams();
        const teamName = opt<string>(args, "team") ?? teams[0]?.name;
        if (!teamName) return ok("No teams found in this project.");
        const top = pageSize(opt<number>(args, "top") ?? 20);
        const skip = Math.max(0, opt<number>(args, "skip") ?? 0);
        const all = await client.getBacklog(teamName, opt<string>(args, "level"));
        if (all.length === 0) return ok("Backlog is empty.");
        const page = all.slice(skip, skip + top);
        const body = page
          .map((b, i) => {
            const rank = skip + i + 1;
            const meta = [
              b.assignedTo !== "Unassigned" ? `@${b.assignedTo}` : null,
              b.storyPoints != null ? `${b.storyPoints}pts` : null,
              b.priority != null ? `P${b.priority}` : null,
            ].filter(Boolean).join(" · ");
            return `${rank}. #${b.id} [${b.type}/${b.state}] ${b.title}${meta ? `  — ${meta}` : ""}`;
          })
          .join("\n");
        const more = skip + page.length < all.length
          ? `\n\n— ${all.length - skip - page.length} more. Call again with skip: ${skip + page.length}.`
          : "";
        return ok(`Backlog for "${teamName}" — ${all.length} item(s):\n\n${body}${more}`);
      }

      // ── Work item history ──────────────────────────────────────────────────
      case "get_work_item_history": {
        const top = opt<number>(args, "top") ?? 15;
        const updates = await client.getWorkItemHistory(num(args, "id"));
        // Most recent first, keep only revisions that actually changed a field.
        const meaningful = updates
          .filter((u) => Object.keys(u.fields).length > 0)
          .reverse()
          .slice(0, top);
        if (meaningful.length === 0) return ok("No change history.");
        const SKIP = new Set([
          "System.Rev", "System.AuthorizedDate", "System.RevisedDate",
          "System.ChangedDate", "System.Watermark", "System.AuthorizedAs",
          "System.PersonId", "System.ChangedBy",
        ]);
        const short = (k: string) => k.split(".").pop() ?? k;
        const val = (v: unknown) => {
          if (v == null || v === "") return "—";
          const s = typeof v === "object" && v && "displayName" in v
            ? String((v as { displayName: string }).displayName)
            : stripHtml(String(v));
          return s.length > 80 ? s.slice(0, 80) + "…" : s;
        };
        const blocks = meaningful.map((u) => {
          const who = u.revisedBy?.displayName ?? "—";
          const when = u.revisedDate?.slice(0, 16).replace("T", " ") ?? "—";
          const changes = Object.entries(u.fields)
            .filter(([k]) => !SKIP.has(k))
            .map(([k, d]) => `  ${short(k)}: ${val(d.oldValue)} → ${val(d.newValue)}`);
          return changes.length
            ? `[${when}] ${who}\n${changes.join("\n")}`
            : null;
        }).filter(Boolean);
        return ok(blocks.length ? blocks.join("\n\n") : "No field changes in recent history.");
      }

      // ── Teams & paths ──────────────────────────────────────────────────────
      case "list_team_members": {
        const teams = await client.listTeams();
        const teamName = opt<string>(args, "team") ?? teams[0]?.name;
        if (!teamName) return ok("No teams found in this project.");
        const members = await client.getTeamMembers(teamName);
        if (members.length === 0) return ok(`No members in team "${teamName}".`);
        return ok(
          `Team "${teamName}" — ${members.length} member(s):\n\n` +
          members.map((m) =>
            `${m.identity.displayName}${m.isTeamAdmin ? " (admin)" : ""}  <${m.identity.uniqueName}>`
          ).join("\n"),
        );
      }

      case "list_paths": {
        const kind = str(args, "kind");
        if (kind === "iteration") {
          const paths = await client.listIterationPaths();
          if (paths.length === 0) return ok("No iteration paths found.");
          return ok(
            `Iteration paths (${paths.length}):\n\n` +
            paths.map((p) => {
              const dates = p.startDate || p.finishDate
                ? `  (${p.startDate?.slice(0, 10) ?? "?"} → ${p.finishDate?.slice(0, 10) ?? "?"})`
                : "";
              return `${p.path}${dates}`;
            }).join("\n"),
          );
        }
        const paths = await client.listAreaPaths();
        if (paths.length === 0) return ok("No area paths found.");
        return ok(`Area paths (${paths.length}):\n\n` + paths.map((p) => p.path).join("\n"));
      }

      case "get_board": {
        const teams = await client.listTeams();
        const teamName = opt<string>(args, "team") ?? teams[0]?.name;
        if (!teamName) return ok("No teams found in this project.");
        const boards = await client.listBoards(teamName);
        if (boards.length === 0) return ok(`No boards for team "${teamName}".`);
        const wanted = opt<string>(args, "board");
        const board = wanted
          ? boards.find((b) => b.name.toLowerCase() === wanted.toLowerCase() || b.id === wanted) ?? boards[0]!
          : boards[0]!;
        const detail = await client.getBoard(teamName, board.id);
        return ok(
          `Board "${detail.name}" (team ${teamName}):\n\n` +
          detail.columns.map((c) => {
            const states = Object.entries(c.stateMappings).map(([wit, st]) => `${wit}→${st}`).join(", ");
            const limit = c.itemLimit > 0 ? `  [WIP ${c.itemLimit}]` : "";
            return `│ ${c.name}${limit}${states ? `\n│   ${states}` : ""}`;
          }).join("\n"),
        );
      }

      // ── Build timeline & cancel ──────────────────────────────────────────────
      case "get_build_timeline": {
        const timeline = await client.getBuildTimeline(num(args, "buildId"));
        const records = timeline.records ?? [];
        if (records.length === 0) return ok("No timeline available (build may not have started).");
        const icon = (r: { state: string; result: string | null }) =>
          r.result === "succeeded" ? "✅"
          : r.result === "failed" ? "❌"
          : r.result === "canceled" ? "⏹"
          : r.state === "inProgress" ? "🔄"
          : "○";
        // Sort by type depth (Stage → Phase → Job → Task) then start time.
        const order: Record<string, number> = { Stage: 0, Phase: 1, Job: 2, Task: 3 };
        const sorted = [...records].sort((a, b) =>
          (order[a.type] ?? 9) - (order[b.type] ?? 9) ||
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
        );
        const lines = sorted.map((r) => {
          const dur = r.startTime && r.finishTime
            ? `${Math.round((new Date(r.finishTime).getTime() - new Date(r.startTime).getTime()) / 1000)}s`
            : "";
          const issues = [
            r.errorCount ? `${r.errorCount} err` : null,
            r.warningCount ? `${r.warningCount} warn` : null,
          ].filter(Boolean).join(", ");
          const indent = "  ".repeat(order[r.type] ?? 0);
          return `${icon(r)} ${indent}${r.name}${dur ? `  (${dur})` : ""}${issues ? `  [${issues}]` : ""}`;
        });
        const failed = sorted.filter((r) => r.result === "failed");
        const header = failed.length
          ? `Build #${num(args, "buildId")} — ${failed.length} failed step(s): ${failed.map((f) => f.name).join(", ")}\n\n`
          : `Build #${num(args, "buildId")} timeline:\n\n`;
        return ok(header + lines.join("\n"));
      }

      case "cancel_build": {
        await client.cancelBuild(num(args, "buildId"));
        return ok(`Build #${num(args, "buildId")} cancellation requested.`);
      }

      // ── Releases ─────────────────────────────────────────────────────────────
      case "list_releases": {
        const releases = await client.listReleases({
          definitionId: opt<number>(args, "definitionId"),
          status: opt<"draft" | "active" | "abandoned">(args, "status"),
          top: opt<number>(args, "top") ?? 10,
        });
        if (releases.length === 0) return ok("No releases found.");
        return ok(
          releases.map((r) => {
            const envs = r.environments.map((e) => {
              const i = e.status === "succeeded" ? "✅"
                : e.status === "failed" || e.status === "rejected" ? "❌"
                : e.status === "inProgress" ? "🔄"
                : e.status === "notStarted" ? "○"
                : "·";
              return `${i} ${e.name}`;
            }).join("  ");
            return [
              `#${r.id} ${r.name} [${r.status}]`,
              `  Def:  ${r.releaseDefinition.name}`,
              `  By:   ${r.createdBy.displayName} · ${r.createdOn.slice(0, 10)}`,
              `  Envs: ${envs || "—"}`,
              `  URL:  ${r._links.web.href}`,
            ].join("\n");
          }).join("\n\n"),
        );
      }

      case "create_release": {
        const r = await client.createRelease(
          num(args, "definitionId"),
          opt<string>(args, "description"),
        );
        return ok([
          `Release created:`,
          `  #${r.id}  ${r.name}`,
          `  Definition: ${r.releaseDefinition.name}`,
          `  Status:     ${r.status}`,
          `  URL:        ${r._links.web.href}`,
        ].join("\n"));
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (e) {
    return fail(e);
  }
}
