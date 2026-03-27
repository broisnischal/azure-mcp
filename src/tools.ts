// ─── MCP Tool definitions & handlers ─────────────────────────────────────────

import type { AzureDevOpsClient, WorkItem } from "./client.ts";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ═════════════════════════════════════════════════════════════════════════════
// Response helpers
// ═════════════════════════════════════════════════════════════════════════════

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function err(e: unknown): CallToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text", text: `❌ Error: ${msg}` }],
    isError: true,
  };
}

function fmtWI(wi: WorkItem): string {
  const f = wi.fields;
  const assigned =
    (f["System.AssignedTo"] as { displayName?: string } | undefined)
      ?.displayName ?? "Unassigned";
  const lines = [
    `#${wi.id} — ${f["System.Title"]}`,
    `  Type:        ${f["System.WorkItemType"]}`,
    `  State:       ${f["System.State"]}`,
    `  Priority:    ${f["Microsoft.VSTS.Common.Priority"] ?? "—"}`,
    `  Assigned:    ${assigned}`,
    `  Sprint:      ${f["System.IterationPath"] ?? "—"}`,
    `  Area:        ${f["System.AreaPath"] ?? "—"}`,
    `  Story Pts:   ${f["Microsoft.VSTS.Scheduling.StoryPoints"] ?? "—"}`,
    `  Remaining:   ${f["Microsoft.VSTS.Scheduling.RemainingWork"] ?? "—"}h`,
    `  Tags:        ${f["System.Tags"] || "—"}`,
    `  Updated:     ${f["System.ChangedDate"]}`,
    `  Created by:  ${(f["System.CreatedBy"] as { displayName?: string } | undefined)?.displayName ?? "—"}`,
  ];
  if (f["System.Description"]) {
    const desc = String(f["System.Description"])
      .replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 300);
    if (desc) lines.push(`  Description: ${desc}`);
  }
  if (wi.relations?.length) {
    lines.push(`  Links:       ${wi.relations.length} relation(s)`);
  }
  return lines.join("\n");
}

function fmtWIs(items: WorkItem[]): string {
  if (items.length === 0) return "No results found.";
  return `${items.length} item(s):\n\n${items.map(fmtWI).join("\n\n──────────────────────────────────\n\n")}`;
}

function a(args: Record<string, unknown>, key: string): string {
  return args[key] as string;
}
function n(args: Record<string, unknown>, key: string): number {
  return args[key] as number;
}
function opt<T>(args: Record<string, unknown>, key: string): T | undefined {
  return args[key] !== undefined && args[key] !== null
    ? (args[key] as T)
    : undefined;
}

// ═════════════════════════════════════════════════════════════════════════════
// Tool definitions
// ═════════════════════════════════════════════════════════════════════════════

export const TOOLS: Tool[] = [
  {
    name: "check_permissions",
    description:
      "Check what your PAT token is allowed to do — probes work items, builds, releases, repos, and boards and returns a pass/fail for each scope. Run this first to validate your setup.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_my_profile",
    description:
      "Get the authenticated user's profile (display name, email, timezone).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_project_info",
    description:
      "Get project details including the process template (Agile/Scrum/CMMI) and VCS type.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description:
      "List all Azure DevOps projects the PAT has access to in this organization.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_work_item_types",
    description:
      "List all available work item types (Task, Bug, User Story, Epic, Feature, etc.) in the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_work_item_type_fields",
    description:
      "Get all fields for a specific work item type, including which are required, their allowed values, and defaults. Use this before creating a work item to know what to fill.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Work item type name e.g. Task, Bug, User Story",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "get_work_item_type_states",
    description:
      "Get valid states for a work item type (e.g. New, Active, Resolved, Closed) including their colours and category.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Work item type e.g. Bug, Task, User Story",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "list_all_fields",
    description:
      "List every field defined in the project (reference name, type, required, read-only). Useful for building custom WIQL queries.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_work_item",
    description:
      "Create a work item (Task, Bug, User Story, Epic, Feature, etc.). Supports story points, estimates, acceptance criteria, bug-specific fields, and parent linking.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Task | Bug | User Story | Epic | Feature | Issue | Test Case",
        },
        title: { type: "string", description: "Work item title" },
        description: {
          type: "string",
          description: "HTML or plain text description",
        },
        assignedTo: { type: "string", description: "Email or display name" },
        priority: {
          type: "number",
          description: "1=Critical 2=High 3=Medium 4=Low",
        },
        tags: { type: "string", description: "Semicolon-separated tags" },
        iterationPath: {
          type: "string",
          description: "e.g. MyProject\\Sprint 3",
        },
        areaPath: { type: "string", description: "e.g. MyProject\\Backend" },
        parentId: { type: "number", description: "Parent work item ID" },
        state: {
          type: "string",
          description: "Initial state e.g. New, Active",
        },
        storyPoints: {
          type: "number",
          description: "Story points (User Story / Epic)",
        },
        remainingWork: {
          type: "number",
          description: "Remaining work in hours (Task)",
        },
        originalEstimate: {
          type: "number",
          description: "Original estimate in hours (Task)",
        },
        acceptanceCriteria: {
          type: "string",
          description: "Acceptance criteria (User Story)",
        },
        reproSteps: { type: "string", description: "Repro steps (Bug)" },
        systemInfo: { type: "string", description: "System info (Bug)" },
        activity: {
          type: "string",
          description: "Activity type for Task (Development, Testing, …)",
        },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "get_work_item",
    description:
      "Get full details of a work item by ID, including all fields, relations, and links.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "Work item ID" } },
      required: ["id"],
    },
  },
  {
    name: "update_work_item",
    description:
      "Update a work item — change title, state, assignee, priority, sprint, story points, estimates, tags, acceptance criteria, or append a discussion comment.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Work item ID" },
        title: { type: "string" },
        description: { type: "string" },
        assignedTo: {
          type: "string",
          description: "Email or display name. Empty string to unassign.",
        },
        priority: { type: "number" },
        tags: { type: "string" },
        state: {
          type: "string",
          description: "Active | Resolved | Closed | New",
        },
        iterationPath: { type: "string" },
        areaPath: { type: "string" },
        storyPoints: { type: "number" },
        remainingWork: { type: "number" },
        originalEstimate: { type: "number" },
        completedWork: { type: "number" },
        acceptanceCriteria: { type: "string" },
        comment: {
          type: "string",
          description: "Append to discussion history",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_work_item",
    description:
      "Delete a work item. Moves to recycle bin by default; set destroy=true to permanently delete.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        destroy: {
          type: "boolean",
          description:
            "Permanently delete (bypass recycle bin). Default false.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_work_item_children",
    description:
      "Get all direct child work items of a parent (hierarchy-forward links).",
    inputSchema: {
      type: "object",
      properties: { parentId: { type: "number" } },
      required: ["parentId"],
    },
  },
  {
    name: "get_work_item_history",
    description:
      "Get full revision history of a work item — every field change with old/new values and timestamps.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "link_work_items",
    description:
      "Create a link between two work items. Common link types: System.LinkTypes.Hierarchy-Reverse (parent), System.LinkTypes.Hierarchy-Forward (child), System.LinkTypes.Related, System.LinkTypes.Dependency-Forward (successor).",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "number" },
        targetId: { type: "number" },
        linkType: {
          type: "string",
          description: "e.g. System.LinkTypes.Related",
        },
        comment: { type: "string" },
      },
      required: ["sourceId", "targetId", "linkType"],
    },
  },
  {
    name: "list_comments",
    description: "List all discussion comments on a work item.",
    inputSchema: {
      type: "object",
      properties: { workItemId: { type: "number" } },
      required: ["workItemId"],
    },
  },
  {
    name: "add_comment",
    description: "Add a discussion comment to a work item.",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: { type: "number" },
        text: { type: "string", description: "Comment text (supports HTML)" },
      },
      required: ["workItemId", "text"],
    },
  },
  {
    name: "search_work_items",
    description:
      "Full-text search across work item titles and descriptions. Supports optional type, state, and assignee filters.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search term" },
        type: {
          type: "string",
          description: "Optional: Task | Bug | User Story | etc.",
        },
        state: {
          type: "string",
          description: "Optional: Active | New | Resolved | etc.",
        },
        assignedTo: {
          type: "string",
          description: "Optional: email or display name",
        },
        top: { type: "number", description: "Max results (default 50)" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "list_recent_work_items",
    description:
      "List the most recently updated work items in the project, optionally filtered by type.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Optional type filter: Task | Bug | User Story | etc.",
        },
        top: { type: "number", description: "Number to return (default 30)" },
      },
    },
  },
  {
    name: "query_my_work_items",
    description:
      "List all open work items assigned to me (the authenticated user).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "query_by_state",
    description:
      "List work items filtered by state (Active, New, Resolved, Closed, etc.) with optional work item type filter.",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description: "Active | New | Resolved | Closed | In Progress | Done",
        },
        type: { type: "string", description: "Optional type filter" },
      },
      required: ["state"],
    },
  },
  {
    name: "query_current_sprint",
    description:
      "List all work items in the current active sprint / iteration.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "query_wiql",
    description:
      "Execute a raw WIQL query for advanced filtering and custom reports. WIQL syntax: SELECT [System.Id] FROM WorkItems WHERE ...",
    inputSchema: {
      type: "object",
      properties: {
        wiql: { type: "string", description: "WIQL query string" },
        top: { type: "number", description: "Max results (default 200)" },
      },
      required: ["wiql"],
    },
  },
  {
    name: "list_area_paths",
    description:
      "List all area paths in the project (flattened tree). Use these values for areaPath when creating work items.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_iteration_paths",
    description:
      "List all iteration paths in the project (sprints, releases). Use these for iterationPath when creating work items.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_teams",
    description: "List all teams in the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_team_members",
    description: "List members of a team including team admin status.",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name" } },
      required: ["team"],
    },
  },
  {
    name: "list_iterations",
    description:
      "List all sprints/iterations for a team with start/end dates and timeframe (current/past/future).",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string" } },
      required: ["team"],
    },
  },
  {
    name: "get_current_iteration",
    description: "Get the currently active sprint for a team.",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string" } },
      required: ["team"],
    },
  },
  {
    name: "list_boards",
    description: "List all boards for a team.",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string" } },
      required: ["team"],
    },
  },
  {
    name: "get_board",
    description:
      "Get board details including columns, item limits, and state-to-column mappings.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string" },
        boardId: { type: "string", description: "Board ID from list_boards" },
      },
      required: ["team", "boardId"],
    },
  },
  {
    name: "list_backlog_levels",
    description:
      "List available backlog levels for a team (e.g. Epics, Stories, Tasks).",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string" } },
      required: ["team"],
    },
  },
  {
    name: "get_backlog",
    description:
      "Get backlog items for a team at a specific level (default: Stories/Requirements).",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string" },
        backlogLevel: {
          type: "string",
          description:
            "Backlog category ID. Default: Microsoft.RequirementCategory. Use list_backlog_levels to find valid IDs.",
        },
      },
      required: ["team"],
    },
  },
  {
    name: "list_repositories",
    description:
      "List all Git repositories in the project with remote URLs, default branch, and size.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_repository",
    description: "Get full details of a repository by ID or name.",
    inputSchema: {
      type: "object",
      properties: {
        repoId: { type: "string", description: "Repository ID or name" },
      },
      required: ["repoId"],
    },
  },
  {
    name: "list_branches",
    description:
      "List all branches in a repository with ahead/behind counts relative to the default branch.",
    inputSchema: {
      type: "object",
      properties: { repoId: { type: "string" } },
      required: ["repoId"],
    },
  },
  {
    name: "list_commits",
    description:
      "List recent commits in a repository. Optionally filter by branch.",
    inputSchema: {
      type: "object",
      properties: {
        repoId: { type: "string" },
        branch: {
          type: "string",
          description: "Branch name (optional, defaults to all branches)",
        },
        top: { type: "number", description: "Number of commits (default 20)" },
      },
      required: ["repoId"],
    },
  },
  {
    name: "list_pull_requests",
    description: "List pull requests in a repository filtered by status.",
    inputSchema: {
      type: "object",
      properties: {
        repoId: { type: "string" },
        status: {
          type: "string",
          description: "active | completed | abandoned | all (default: active)",
        },
      },
      required: ["repoId"],
    },
  },
  {
    name: "get_pull_request",
    description:
      "Get full details of a pull request including reviewers and their votes.",
    inputSchema: {
      type: "object",
      properties: {
        repoId: { type: "string" },
        prId: { type: "number", description: "Pull request ID" },
      },
      required: ["repoId", "prId"],
    },
  },
  {
    name: "list_pipelines",
    description: "List all CI/CD pipelines defined in the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_builds",
    description:
      "List build runs. Filter by pipeline, branch, status (inProgress, completed, …), or result (succeeded, failed, canceled, …).",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: {
          type: "number",
          description: "Optional pipeline/definition ID filter",
        },
        branch: {
          type: "string",
          description: "Optional branch filter e.g. refs/heads/main",
        },
        status: {
          type: "string",
          description: "all | inProgress | completed | cancelling | notStarted",
        },
        result: {
          type: "string",
          description: "succeeded | failed | canceled | partiallySucceeded",
        },
        top: {
          type: "number",
          description: "Number of builds (default all recent)",
        },
      },
    },
  },
  {
    name: "get_build",
    description:
      "Get full details of a specific build run including timing and requester.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" } },
      required: ["buildId"],
    },
  },
  {
    name: "get_build_timeline",
    description:
      "Get the stage/job/step timeline of a build to see which steps passed or failed.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" } },
      required: ["buildId"],
    },
  },
  {
    name: "get_build_logs",
    description:
      "List log files available for a build (each log has an ID you can fetch content for).",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" } },
      required: ["buildId"],
    },
  },
  {
    name: "get_build_log_content",
    description: "Fetch the raw text content of a specific build log.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" }, logId: { type: "number" } },
      required: ["buildId", "logId"],
    },
  },
  {
    name: "queue_build",
    description:
      "Trigger (queue) a pipeline run. Optionally specify branch and pipeline variables.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "number" },
        branch: {
          type: "string",
          description: "Source branch e.g. refs/heads/main",
        },
        variables: {
          type: "object",
          description: "Key-value pairs of pipeline variables",
        },
      },
      required: ["pipelineId"],
    },
  },
  {
    name: "cancel_build",
    description: "Cancel a running build.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "number" } },
      required: ["buildId"],
    },
  },
  {
    name: "list_release_definitions",
    description:
      "List all release pipeline definitions with their environments.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_release_definition",
    description: "Get full details of a release pipeline definition.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Release definition ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_releases",
    description:
      "List release instances with environment deployment statuses. Filter by definition, status, or top N.",
    inputSchema: {
      type: "object",
      properties: {
        definitionId: { type: "number" },
        status: { type: "string", description: "draft | active | abandoned" },
        top: { type: "number" },
      },
    },
  },
  {
    name: "get_release",
    description:
      "Get full details of a specific release including all environment deployment statuses.",
    inputSchema: {
      type: "object",
      properties: { releaseId: { type: "number" } },
      required: ["releaseId"],
    },
  },
  {
    name: "create_release",
    description: "Create (trigger) a new release from a release definition.",
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
// Tool handler dispatch
// ═════════════════════════════════════════════════════════════════════════════

export async function handleTool(
  client: AzureDevOpsClient,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "check_permissions": {
        const p = await client.checkPermissions();
        const lines = [
          "# PAT Permission Check",
          "",
          ...Object.entries(p.details).map(([k, v]) => `${v}  ${k}`),
          "",
          p.profile && p.workItems && p.builds
            ? "✅ Core scopes OK — you're good to go."
            : "⚠️  Some scopes are missing. Check PAT settings at https://dev.azure.com/{org}/_usersSettings/tokens",
        ];
        return ok(lines.join("\n"));
      }
      case "get_my_profile": {
        const profile = await client.getMyProfile();
        return ok(
          [
            `Display Name: ${profile.displayName}`,
            `Email:        ${profile.emailAddress}`,
            `Alias:        ${profile.publicAlias}`,
            `Timezone:     ${profile.timeZone}`,
            `Profile ID:   ${profile.id}`,
          ].join("\n"),
        );
      }
      case "get_project_info": {
        const p = await client.getProjectInfo();
        const lines = [
          `Project:     ${p.name}`,
          `State:       ${p.state}`,
          `Visibility:  ${p.visibility}`,
          `URL:         ${p.url}`,
        ];
        if (p.capabilities) {
          lines.push(
            `VCS:         ${p.capabilities.versioncontrol.sourceControlType}`,
          );
          lines.push(
            `Process:     ${p.capabilities.processTemplate.templateName}`,
          );
        }
        return ok(lines.join("\n"));
      }
      case "list_projects":
        return ok(
          (await client.listProjects())
            .map((p) => `• ${p.name}  [${p.state}]  ${p.visibility}`)
            .join("\n"),
        );
      case "list_work_item_types":
        return ok(
          (await client.listWorkItemTypes())
            .filter((t) => !t.isDisabled)
            .map(
              (t) => `• ${t.name}${t.description ? ` — ${t.description}` : ""}`,
            )
            .join("\n"),
        );
      case "get_work_item_type_fields": {
        const fields = await client.getWorkItemTypeFields(a(args, "type"));
        const required = fields.filter((f) => f.required);
        const optional = fields.filter((f) => !f.required);
        const fmt = (f: (typeof fields)[0]) => {
          let line = `  ${f.name} (${f.referenceName})`;
          if (f.defaultValue !== undefined && f.defaultValue !== null)
            line += ` — default: ${f.defaultValue}`;
          if (f.allowedValues?.length)
            line += `\n    Allowed: ${f.allowedValues.join(" | ")}`;
          return line;
        };
        return ok(
          [
            `Fields for: ${a(args, "type")}`,
            "",
            `REQUIRED (${required.length}):`,
            ...required.map(fmt),
            "",
            `OPTIONAL (${optional.length}):`,
            ...optional.slice(0, 30).map(fmt),
            optional.length > 30 ? `  … and ${optional.length - 30} more` : "",
          ]
            .filter((l) => l !== "")
            .join("\n"),
        );
      }
      case "get_work_item_type_states":
        return ok(
          `States for ${a(args, "type")}:\n\n${(await client.getWorkItemTypeStates(a(args, "type"))).map((s) => `  • ${s.name}  [${s.category}]`).join("\n")}`,
        );
      case "list_all_fields": {
        const fields = await client.listAllFields();
        return ok(
          `${fields.length} fields in project:\n\n${fields.map((f) => `• ${f.name} (${f.referenceName})  type:${f.type}${f.required ? "  REQUIRED" : ""}${f.readOnly ? "  readonly" : ""}`).join("\n")}`,
        );
      }
      case "create_work_item":
        return ok(
          `✅ Created:\n\n${fmtWI(
            await client.createWorkItem({
              type: a(args, "type"),
              title: a(args, "title"),
              description: opt(args, "description"),
              assignedTo: opt(args, "assignedTo"),
              priority: opt(args, "priority"),
              tags: opt(args, "tags"),
              iterationPath: opt(args, "iterationPath"),
              areaPath: opt(args, "areaPath"),
              parentId: opt(args, "parentId"),
              state: opt(args, "state"),
              storyPoints: opt(args, "storyPoints"),
              remainingWork: opt(args, "remainingWork"),
              originalEstimate: opt(args, "originalEstimate"),
              acceptanceCriteria: opt(args, "acceptanceCriteria"),
              reproSteps: opt(args, "reproSteps"),
              systemInfo: opt(args, "systemInfo"),
              activity: opt(args, "activity"),
            }),
          )}`,
        );
      case "get_work_item":
        return ok(fmtWI(await client.getWorkItem(n(args, "id"))));
      case "update_work_item":
        return ok(
          `✅ Updated:\n\n${fmtWI(
            await client.updateWorkItem({
              id: n(args, "id"),
              title: opt(args, "title"),
              description: opt(args, "description"),
              assignedTo: opt(args, "assignedTo"),
              priority: opt(args, "priority"),
              tags: opt(args, "tags"),
              state: opt(args, "state"),
              iterationPath: opt(args, "iterationPath"),
              areaPath: opt(args, "areaPath"),
              storyPoints: opt(args, "storyPoints"),
              remainingWork: opt(args, "remainingWork"),
              originalEstimate: opt(args, "originalEstimate"),
              completedWork: opt(args, "completedWork"),
              acceptanceCriteria: opt(args, "acceptanceCriteria"),
              comment: opt(args, "comment"),
            }),
          )}`,
        );
      case "delete_work_item": {
        await client.deleteWorkItem(
          n(args, "id"),
          opt<boolean>(args, "destroy") ?? false,
        );
        const mode = args["destroy"]
          ? "permanently deleted"
          : "moved to recycle bin";
        return ok(`🗑️ Work item #${n(args, "id")} ${mode}.`);
      }
      case "get_work_item_children":
        return ok(
          fmtWIs(await client.getWorkItemChildren(n(args, "parentId"))),
        );
      case "get_work_item_history": {
        const revs = await client.getWorkItemHistory(n(args, "id"));
        return ok(
          revs
            .map((r) => {
              const changes = Object.entries(r.fields)
                .map(
                  ([k, v]) =>
                    `  ${k}: ${JSON.stringify(v.oldValue)} → ${JSON.stringify(v.newValue)}`,
                )
                .join("\n");
              return `Rev ${r.rev} — ${r.revisedDate.slice(0, 16)}\n${changes || "  (no tracked field changes)"}`;
            })
            .join("\n\n"),
        );
      }
      case "link_work_items":
        return ok(
          `✅ Linked #${n(args, "sourceId")} → #${n(args, "targetId")} (${a(args, "linkType")})\n\n${fmtWI(
            await client.linkWorkItems(
              n(args, "sourceId"),
              n(args, "targetId"),
              a(args, "linkType"),
              opt(args, "comment"),
            ),
          )}`,
        );
      case "list_comments": {
        const comments = await client.listComments(n(args, "workItemId"));
        if (comments.length === 0) return ok("No comments yet.");
        return ok(
          comments
            .map(
              (c) =>
                `[${c.createdDate.slice(0, 16)}] ${c.createdBy.displayName}\n${c.text.replace(/<[^>]+>/g, "").trim()}`,
            )
            .join("\n\n──────────────\n\n"),
        );
      }
      case "add_comment": {
        const c = await client.addComment(
          n(args, "workItemId"),
          a(args, "text"),
        );
        return ok(
          `💬 Comment added by ${c.createdBy.displayName} at ${c.createdDate.slice(0, 16)}`,
        );
      }
      case "search_work_items":
        return ok(
          fmtWIs(
            await client.searchWorkItems({
              keyword: a(args, "keyword"),
              type: opt(args, "type"),
              state: opt(args, "state"),
              assignedTo: opt(args, "assignedTo"),
              top: opt(args, "top"),
            }),
          ),
        );
      case "list_recent_work_items":
        return ok(
          fmtWIs(
            await client.listRecentWorkItems(
              opt(args, "type"),
              opt<number>(args, "top"),
            ),
          ),
        );
      case "query_my_work_items":
        return ok(fmtWIs(await client.queryMyWorkItems()));
      case "query_by_state":
        return ok(
          fmtWIs(
            await client.queryByState(a(args, "state"), opt(args, "type")),
          ),
        );
      case "query_current_sprint":
        return ok(fmtWIs(await client.queryCurrentSprint()));
      case "query_wiql": {
        const result = await client.queryWiql(
          a(args, "wiql"),
          opt<number>(args, "top") ?? 200,
        );
        const ids = result.workItems.map((w) => w.id);
        if (ids.length === 0) return ok("Query returned 0 results.");
        return ok(fmtWIs(await client.listWorkItems(ids)));
      }
      case "list_area_paths": {
        const paths = await client.listAreaPaths();
        return ok(
          `${paths.length} area path(s):\n\n${paths.map((p) => `• ${p.path}`).join("\n")}`,
        );
      }
      case "list_iteration_paths": {
        const paths = await client.listIterationPaths();
        return ok(
          `${paths.length} iteration path(s):\n\n${paths
            .map((p) => {
              const dates = p.startDate
                ? `  ${p.startDate.slice(0, 10)} → ${p.finishDate?.slice(0, 10) ?? "?"}`
                : "";
              return `• ${p.path}${dates}`;
            })
            .join("\n")}`,
        );
      }
      case "list_teams":
        return ok(
          (await client.listTeams())
            .map(
              (t) => `• ${t.name}${t.description ? ` — ${t.description}` : ""}`,
            )
            .join("\n"),
        );
      case "get_team_members":
        return ok(
          (await client.getTeamMembers(a(args, "team")))
            .map(
              (m) =>
                `• ${m.identity.displayName} <${m.identity.uniqueName}>${m.isTeamAdmin ? " [admin]" : ""}`,
            )
            .join("\n"),
        );
      case "list_iterations":
        return ok(
          (await client.listIterations(a(args, "team")))
            .map(
              (i) =>
                `• ${i.name}${i.attributes.timeFrame ? ` [${i.attributes.timeFrame}]` : ""}  ${i.attributes.startDate?.slice(0, 10) ?? "?"} → ${i.attributes.finishDate?.slice(0, 10) ?? "?"}`,
            )
            .join("\n"),
        );
      case "get_current_iteration": {
        const iter = await client.getCurrentIteration(a(args, "team"));
        if (!iter) return ok("No active iteration found for this team.");
        return ok(
          [
            `Sprint:  ${iter.name}`,
            `Path:    ${iter.path}`,
            `Start:   ${iter.attributes.startDate?.slice(0, 10) ?? "—"}`,
            `End:     ${iter.attributes.finishDate?.slice(0, 10) ?? "—"}`,
          ].join("\n"),
        );
      }
      case "list_boards":
        return ok(
          (await client.listBoards(a(args, "team")))
            .map((b) => `• ${b.name}  (id: ${b.id})`)
            .join("\n"),
        );
      case "get_board": {
        const board = await client.getBoard(
          a(args, "team"),
          a(args, "boardId"),
        );
        const cols = board.columns
          .map((c) => {
            const mappings = Object.entries(c.stateMappings)
              .map(([type, state]) => `    ${type}: ${state}`)
              .join("\n");
            return `  • ${c.name}  (limit: ${c.itemLimit || "∞"})${c.isSplit ? " [split]" : ""}${mappings ? `\n${mappings}` : ""}`;
          })
          .join("\n");
        return ok(`Board: ${board.name}\n\nColumns:\n${cols}`);
      }
      case "list_backlog_levels":
        return ok(
          (await client.listBacklogLevels(a(args, "team")))
            .map(
              (l) =>
                `• ${l.name} (${l.id})\n  Types: ${l.workItemTypes.join(", ")}`,
            )
            .join("\n\n"),
        );
      case "get_backlog": {
        const items = await client.getBacklog(
          a(args, "team"),
          opt(args, "backlogLevel") ?? "Microsoft.RequirementCategory",
        );
        if (items.length === 0) return ok("Backlog is empty at this level.");
        return ok(
          `Backlog (${items.length} items):\n\n${items.map((i) => `#${i.id} [${i.state}] ${i.title}  pts:${i.storyPoints ?? "—"}  p:${i.priority ?? "—"}  → ${i.assignedTo}`).join("\n")}`,
        );
      }
      case "list_repositories":
        return ok(
          (await client.listRepositories())
            .map(
              (r) =>
                `• ${r.name}  branch:${r.defaultBranch ?? "—"}  size:${(r.size / 1024).toFixed(1)}KB\n  ${r.remoteUrl}`,
            )
            .join("\n\n"),
        );
      case "get_repository": {
        const r = await client.getRepository(a(args, "repoId"));
        return ok(
          [
            `Name:    ${r.name}`,
            `Branch:  ${r.defaultBranch}`,
            `Size:    ${(r.size / 1024).toFixed(1)} KB`,
            `Remote:  ${r.remoteUrl}`,
            `SSH:     ${r.sshUrl}`,
            `Web:     ${r.webUrl}`,
            `Enabled: ${!r.isDisabled}`,
          ].join("\n"),
        );
      }
      case "list_branches":
        return ok(
          (await client.listBranches(a(args, "repoId")))
            .map(
              (b) =>
                `• ${b.name}  +${b.aheadCount}/-${b.behindCount}  ${b.creator?.displayName ?? ""}`,
            )
            .join("\n"),
        );
      case "list_commits":
        return ok(
          (
            await client.listCommits(
              a(args, "repoId"),
              opt(args, "branch"),
              opt<number>(args, "top") ?? 20,
            )
          )
            .map(
              (c) =>
                `${c.commitId.slice(0, 8)}  ${c.author.date.slice(0, 10)}  ${c.author.name}\n  ${c.comment.split("\n")[0]?.slice(0, 100)}`,
            )
            .join("\n\n"),
        );
      case "list_pull_requests": {
        const prs = await client.listPullRequests(
          a(args, "repoId"),
          (opt(args, "status") ?? "active") as
            | "active"
            | "completed"
            | "abandoned"
            | "all",
        );
        if (prs.length === 0) return ok("No pull requests found.");
        return ok(
          prs
            .map((pr) =>
              [
                `#${pr.pullRequestId} [${pr.status}${pr.isDraft ? "/draft" : ""}] ${pr.title}`,
                `  By:     ${pr.createdBy.displayName}`,
                `  From:   ${pr.sourceRefName} → ${pr.targetRefName}`,
                `  Merge:  ${pr.mergeStatus}`,
                `  Votes:  ${pr.reviewers.map((r) => `${r.displayName}:${r.vote > 0 ? "✅" : r.vote < 0 ? "❌" : "⏳"}`).join(", ") || "no reviewers"}`,
              ].join("\n"),
            )
            .join("\n\n"),
        );
      }
      case "get_pull_request": {
        const pr = await client.getPullRequest(
          a(args, "repoId"),
          n(args, "prId"),
        );
        return ok(
          [
            `#${pr.pullRequestId} — ${pr.title}`,
            `Status:   ${pr.status}${pr.isDraft ? " (draft)" : ""}`,
            `By:       ${pr.createdBy.displayName}`,
            `From:     ${pr.sourceRefName}`,
            `Into:     ${pr.targetRefName}`,
            `Merge:    ${pr.mergeStatus}`,
            `Created:  ${pr.creationDate.slice(0, 10)}`,
            pr.closedDate ? `Closed:   ${pr.closedDate.slice(0, 10)}` : "",
            "Reviewers:",
            ...pr.reviewers.map(
              (r) => `  • ${r.displayName} — vote: ${r.vote}`,
            ),
            pr.description
              ? `\nDescription:\n${pr.description.slice(0, 500)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      case "list_pipelines":
        return ok(
          (await client.listPipelines())
            .map(
              (p) =>
                `• [${p.id}] ${p.folder !== "\\" ? `${p.folder}/` : ""}${p.name}`,
            )
            .join("\n"),
        );
      case "list_builds": {
        type BuildStatus =
          | "all"
          | "inProgress"
          | "completed"
          | "cancelling"
          | "notStarted";
        type BuildResult =
          | "succeeded"
          | "failed"
          | "canceled"
          | "partiallySucceeded";
        const builds = await client.listBuilds({
          pipelineId: opt<number>(args, "pipelineId"),
          branch: opt<string>(args, "branch"),
          status: opt<BuildStatus>(args, "status"),
          result: opt<BuildResult>(args, "result"),
          top: opt<number>(args, "top"),
        });
        if (builds.length === 0) return ok("No builds found.");
        return ok(
          builds
            .map((b) => {
              const dur =
                b.startTime && b.finishTime
                  ? `  ${Math.round((new Date(b.finishTime).getTime() - new Date(b.startTime).getTime()) / 60000)}m`
                  : "";
              const icon =
                b.result === "succeeded"
                  ? "✅"
                  : b.result === "failed"
                    ? "❌"
                    : b.result === "canceled"
                      ? "⏹️"
                      : b.status === "inProgress"
                        ? "🔄"
                        : "⚪";
              return `${icon} #${b.id} ${b.buildNumber}  ${b.definition.name}  ${b.sourceBranch.replace("refs/heads/", "")}${dur}`;
            })
            .join("\n"),
        );
      }
      case "get_build": {
        const b = await client.getBuild(n(args, "buildId"));
        const dur =
          b.startTime && b.finishTime
            ? `${Math.round((new Date(b.finishTime).getTime() - new Date(b.startTime).getTime()) / 60000)} min`
            : "—";
        return ok(
          [
            `Build #${b.id} — ${b.buildNumber}`,
            `Pipeline:  ${b.definition.name} (id: ${b.definition.id})`,
            `Status:    ${b.status}`,
            `Result:    ${b.result ?? "—"}`,
            `Branch:    ${b.sourceBranch}`,
            `Commit:    ${b.sourceVersion?.slice(0, 8) ?? "—"}`,
            `Queued:    ${b.queueTime?.slice(0, 16)}`,
            `Started:   ${b.startTime?.slice(0, 16) ?? "—"}`,
            `Finished:  ${b.finishTime?.slice(0, 16) ?? "—"}`,
            `Duration:  ${dur}`,
            `By:        ${b.requestedBy.displayName}`,
            `URL:       ${b._links.web.href}`,
          ].join("\n"),
        );
      }
      case "get_build_timeline": {
        const tl = await client.getBuildTimeline(n(args, "buildId"));
        const stages = tl.records.filter((r) => r.type === "Stage");
        const jobs = tl.records.filter((r) => r.type === "Job");
        const steps = tl.records.filter((r) => r.type === "Task");
        const icon = (r: { result: string | null; state: string }) =>
          r.result === "succeeded"
            ? "✅"
            : r.result === "failed"
              ? "❌"
              : r.state === "inProgress"
                ? "🔄"
                : r.result === "skipped"
                  ? "⏭️"
                  : "⚪";
        const fmt = (r: (typeof tl.records)[0]) => {
          const dur =
            r.startTime && r.finishTime
              ? ` (${Math.round((new Date(r.finishTime).getTime() - new Date(r.startTime).getTime()) / 1000)}s)`
              : "";
          const errs = r.errorCount ? ` ⚠️ ${r.errorCount} error(s)` : "";
          return `  ${icon(r)} ${r.name}${dur}${errs}`;
        };
        const out: string[] = [];
        for (const stage of stages) {
          out.push(`\n${icon(stage)} STAGE: ${stage.name}`);
          for (const job of jobs.filter((j) => j.parentId === stage.id)) {
            out.push(`  ${icon(job)} JOB: ${job.name}`);
            for (const step of steps.filter((s) => s.parentId === job.id))
              out.push(fmt(step));
          }
        }
        if (out.length === 0) return ok(tl.records.map(fmt).join("\n"));
        return ok(`Build #${n(args, "buildId")} timeline:${out.join("\n")}`);
      }
      case "get_build_logs": {
        const logs = await client.getBuildLogs(n(args, "buildId"));
        return ok(
          `${logs.length} log(s):\n${logs.map((l) => `  [${l.id}] ${l.type}  ${l.lineCount} lines`).join("\n")}`,
        );
      }
      case "get_build_log_content": {
        const content = await client.getBuildLogContent(
          n(args, "buildId"),
          n(args, "logId"),
        );
        return ok(
          content.slice(0, 8000) +
            (content.length > 8000 ? "\n… (truncated)" : ""),
        );
      }
      case "queue_build": {
        const build = await client.queueBuild(
          n(args, "pipelineId"),
          opt(args, "branch"),
          opt(args, "variables") as Record<string, string> | undefined,
        );
        return ok(
          `🚀 Build queued: #${build.id} ${build.buildNumber}\nStatus: ${build.status}\nURL: ${build._links.web.href}`,
        );
      }
      case "cancel_build":
        await client.cancelBuild(n(args, "buildId"));
        return ok(`⏹️ Build #${n(args, "buildId")} cancel requested.`);
      case "list_release_definitions":
        return ok(
          (await client.listReleaseDefinitions())
            .map(
              (d) =>
                `• [${d.id}] ${d.name}\n  Environments: ${d.environments.map((e) => e.name).join(" → ")}`,
            )
            .join("\n\n"),
        );
      case "get_release_definition": {
        const d = await client.getReleaseDefinition(n(args, "id"));
        return ok(
          [
            `Release Definition #${d.id} — ${d.name}`,
            `Path:       ${d.path}`,
            `Format:     ${d.releaseNameFormat}`,
            `Modified:   ${d.modifiedOn?.slice(0, 10)}`,
            "Environments:",
            ...d.environments.map((e) => `  ${e.rank}. ${e.name}`),
          ].join("\n"),
        );
      }
      case "list_releases": {
        const releases = await client.listReleases({
          definitionId: opt<number>(args, "definitionId"),
          status: opt(args, "status") as
            | "draft"
            | "active"
            | "abandoned"
            | undefined,
          top: opt<number>(args, "top"),
        });
        if (releases.length === 0) return ok("No releases found.");
        return ok(
          releases
            .map((r) => {
              const envLines = r.environments
                .map((e) => {
                  const icon =
                    e.status === "succeeded"
                      ? "✅"
                      : e.status === "failed"
                        ? "❌"
                        : e.status === "inProgress"
                          ? "🔄"
                          : e.status === "rejected"
                            ? "🚫"
                            : "⚪";
                  return `    ${icon} ${e.name}: ${e.status}`;
                })
                .join("\n");
              return [
                `#${r.id} ${r.name}  [${r.status}]  by ${r.createdBy.displayName}  ${r.createdOn.slice(0, 10)}`,
                `  Pipeline: ${r.releaseDefinition.name}`,
                envLines,
              ].join("\n");
            })
            .join("\n\n"),
        );
      }
      case "get_release": {
        const r = await client.getRelease(n(args, "releaseId"));
        const envDetails = r.environments
          .map((e) => {
            const latest = e.deploySteps.at(-1);
            return [
              `  • ${e.name}: ${e.status}`,
              latest
                ? `    Last deploy: ${latest.status}  ${latest.lastModifiedOn.slice(0, 16)}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n");
        return ok(
          [
            `Release #${r.id} — ${r.name}`,
            `Status:    ${r.status}`,
            `Pipeline:  ${r.releaseDefinition.name}`,
            `Created:   ${r.createdOn.slice(0, 10)} by ${r.createdBy.displayName}`,
            `Modified:  ${r.modifiedOn.slice(0, 10)}`,
            `URL:       ${r._links.web.href}`,
            `\nEnvironments:\n${envDetails}`,
          ].join("\n"),
        );
      }
      case "create_release": {
        const r = await client.createRelease(
          n(args, "definitionId"),
          opt(args, "description"),
        );
        return ok(
          `🚀 Release created: #${r.id} ${r.name}\nStatus: ${r.status}\nURL: ${r._links.web.href}`,
        );
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (e) {
    return err(e);
  }
}
