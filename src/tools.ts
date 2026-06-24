// ─── MCP Tool definitions & handlers ─────────────────────────────────────────

import type { AzureDevOpsClient, WorkItem } from "./client.ts";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

const ok = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });
const fail = (e: unknown): CallToolResult => ({
  content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

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
// 9 Tools
// ═════════════════════════════════════════════════════════════════════════════

export const TOOLS: Tool[] = [
  {
    name: "auth_status",
    description:
      "Check the current authentication — org, project, token type, and whether it is valid. Call this first if something seems wrong.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_work_items",
    description:
      "List work items. Combine filters freely: mine=true for your open items, sprint=true for the current sprint, state for a specific status (Active/New/Resolved/Closed), keyword for full-text search. No filters = most recently updated.",
    inputSchema: {
      type: "object",
      properties: {
        mine: { type: "boolean", description: "Only items assigned to me" },
        sprint: { type: "boolean", description: "Only items in the current sprint" },
        state: { type: "string", description: "Active | New | Resolved | Closed | Done | In Progress" },
        type: { type: "string", description: "Task | Bug | User Story | Epic | Feature" },
        keyword: { type: "string", description: "Full-text search across title and description" },
        top: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_work_item",
    description: "Get the full detail of one work item by ID — all fields, description, and linked items.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "Work item ID" } },
      required: ["id"],
    },
  },
  {
    name: "create_work_item",
    description:
      "Create a work item. type is required (Task, Bug, User Story, Epic, Feature, …). Call list_work_items first to confirm the sprint/area path values.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Task | Bug | User Story | Epic | Feature | Issue" },
        title: { type: "string" },
        description: { type: "string" },
        assignedTo: { type: "string", description: "Email or display name" },
        priority: { type: "number", description: "1=Critical 2=High 3=Medium 4=Low" },
        state: { type: "string", description: "Initial state, e.g. New or Active" },
        iterationPath: { type: "string", description: "Sprint path, e.g. MyProject\\Sprint 3" },
        areaPath: { type: "string", description: "Area path, e.g. MyProject\\Backend" },
        parentId: { type: "number", description: "Parent work item ID" },
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
    description:
      "Update a work item. Only supply the fields you want to change. Use comment to append to the discussion.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        state: { type: "string", description: "Active | Resolved | Closed | New" },
        assignedTo: { type: "string", description: "Email, display name, or empty string to unassign" },
        priority: { type: "number" },
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
    name: "query_wiql",
    description:
      "Run a raw WIQL query for advanced filtering. Syntax: SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND … ORDER BY …",
    inputSchema: {
      type: "object",
      properties: {
        wiql: { type: "string" },
        top: { type: "number", description: "Max results (default 50)" },
      },
      required: ["wiql"],
    },
  },
  {
    name: "list_builds",
    description:
      "List CI/CD build runs. Filter by pipeline, branch, status (inProgress | completed), or result (succeeded | failed | canceled). Includes a direct link to each build.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "number", description: "Pipeline / definition ID" },
        branch: { type: "string", description: "e.g. refs/heads/main" },
        status: { type: "string", description: "all | inProgress | completed | notStarted" },
        result: { type: "string", description: "succeeded | failed | canceled | partiallySucceeded" },
        top: { type: "number", description: "Number of results (default 10)" },
      },
    },
  },
  {
    name: "list_pull_requests",
    description:
      "List pull requests in a repository. Use list_work_items first to get the repo name if unknown.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name or ID" },
        status: { type: "string", description: "active | completed | abandoned | all (default: active)" },
      },
      required: ["repo"],
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
        const p = await client.checkPermissions();
        return ok(
          [
            "Auth check",
            "",
            ...Object.entries(p.details).map(([k, v]) => `  ${v}  ${k}`),
            "",
            p.workItems
              ? "Work items: ok"
              : "Work items: FAILED — check PAT scopes at https://dev.azure.com/{org}/_usersSettings/tokens",
          ].join("\n"),
        );
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

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (e) {
    return fail(e);
  }
}
