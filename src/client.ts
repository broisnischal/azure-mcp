// ─── Azure DevOps REST API client ────────────────────────────────────────────
// Docs: https://learn.microsoft.com/en-us/rest/api/azure/devops
// API version pinned to 7.1 across all endpoints

import { buildAuthHeader, type StoredAuth } from "./auth.ts";
import { Cache, TTL } from "./cache.ts";

export type { StoredAuth as AzureConfig };

// ═════════════════════════════════════════════════════════════════════════════
// Work Items
// ═════════════════════════════════════════════════════════════════════════════

export interface WorkItem {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
  relations?: Array<{
    rel: string;
    url: string;
    attributes: Record<string, unknown>;
  }>;
  url: string;
}

export interface WorkItemAttachment {
  name: string;
  url: string;
  comment?: string;
}

export interface WorkItemCreate {
  type: string;
  title: string;
  description?: string;
  assignedTo?: string;
  priority?: number;
  tags?: string;
  iterationPath?: string;
  areaPath?: string;
  parentId?: number;
  state?: string;
  storyPoints?: number;
  remainingWork?: number;
  originalEstimate?: number;
  acceptanceCriteria?: string;
  startDate?: string;
  targetDate?: string;
  reproSteps?: string; // Bug-specific
  systemInfo?: string; // Bug-specific
  activity?: string; // Task activity type
}

export interface WorkItemUpdate {
  id: number;
  title?: string;
  description?: string;
  assignedTo?: string;
  priority?: number;
  tags?: string;
  state?: string;
  iterationPath?: string;
  areaPath?: string;
  storyPoints?: number;
  remainingWork?: number;
  originalEstimate?: number;
  completedWork?: number;
  acceptanceCriteria?: string;
  startDate?: string;
  targetDate?: string;
  comment?: string; // Discussion comment / history entry
}

export interface WorkItemComment {
  id: number;
  workItemId: number;
  text: string;
  createdBy: { displayName: string; uniqueName: string };
  createdDate: string;
  modifiedDate: string;
}

export interface WorkItemType {
  name: string;
  description: string;
  color: string;
  icon: { url: string };
  isDisabled: boolean;
}

export interface WorkItemField {
  referenceName: string;
  name: string;
  type: string;
  required: boolean;
  readOnly: boolean;
  description: string;
  allowedValues?: string[];
  defaultValue?: unknown;
}

export interface WorkItemTypeField {
  referenceName: string;
  name: string;
  required: boolean;
  defaultValue?: unknown;
  allowedValues?: string[];
  helpText?: string;
}

export interface QueryResult {
  workItems: Array<{ id: number; url: string }>;
  columns: Array<{ referenceName: string; name: string }>;
}

// ═════════════════════════════════════════════════════════════════════════════
// Teams, Iterations, Backlog
// ═════════════════════════════════════════════════════════════════════════════

export interface Team {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface TeamMember {
  identity: {
    id: string;
    displayName: string;
    uniqueName: string;
    imageUrl: string;
  };
  isTeamAdmin: boolean;
}

export interface TeamCapacity {
  teamMember: {
    id: string;
    displayName: string;
    uniqueName: string;
  };
  activities: Array<{
    name: string;
    capacityPerDay: number;
  }>;
  daysOff: Array<{
    start: string;
    end: string;
  }>;
}

export interface Iteration {
  id: string;
  name: string;
  path: string;
  attributes: {
    startDate?: string;
    finishDate?: string;
    timeFrame?: string; // "current" | "past" | "future"
  };
}

export interface BacklogItem {
  id: number;
  title: string;
  type: string;
  state: string;
  assignedTo: string;
  priority: number | null;
  storyPoints: number | null;
  order: number;
}

export interface BoardColumn {
  id: string;
  name: string;
  itemLimit: number;
  stateMappings: Record<string, string>;
  isSplit: boolean;
  description: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Repositories
// ═════════════════════════════════════════════════════════════════════════════

export interface Repository {
  id: string;
  name: string;
  defaultBranch: string;
  size: number;
  remoteUrl: string;
  sshUrl: string;
  webUrl: string;
  isDisabled: boolean;
  project: { id: string; name: string };
}

export interface Branch {
  name: string;
  objectId: string;
  isBaseVersion: boolean;
  aheadCount: number;
  behindCount: number;
  creator: { displayName: string; uniqueName: string };
}

export interface PullRequest {
  pullRequestId: number;
  title: string;
  description: string;
  status: string;
  createdBy: { displayName: string; uniqueName: string };
  creationDate: string;
  closedDate?: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus: string;
  isDraft: boolean;
  reviewers: Array<{ displayName: string; vote: number }>;
  url: string;
}

export interface GitCommit {
  commitId: string;
  comment: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  remoteUrl: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Pipelines & Builds
// ═════════════════════════════════════════════════════════════════════════════

export interface Pipeline {
  id: number;
  name: string;
  folder: string;
  revision: number;
  url: string;
}

export interface Build {
  id: number;
  buildNumber: string;
  status: string;
  result: string | null;
  queueTime: string;
  startTime?: string;
  finishTime?: string;
  sourceBranch: string;
  sourceVersion: string;
  requestedBy: { displayName: string; uniqueName: string };
  requestedFor: { displayName: string; uniqueName: string };
  definition: { id: number; name: string };
  project: { name: string };
  url: string;
  _links: { web: { href: string } };
}

export interface BuildLog {
  id: number;
  type: string;
  url: string;
  lineCount: number;
}

export interface BuildTimeline {
  id: string;
  records: Array<{
    id: string;
    parentId: string | null;
    type: string;
    name: string;
    state: string;
    result: string | null;
    startTime?: string;
    finishTime?: string;
    errorCount: number;
    warningCount: number;
  }>;
}

// ═════════════════════════════════════════════════════════════════════════════
// Releases
// ═════════════════════════════════════════════════════════════════════════════

export interface ReleaseDefinition {
  id: number;
  name: string;
  path: string;
  releaseNameFormat: string;
  environments: Array<{ id: number; name: string; rank: number }>;
  modifiedOn: string;
  url: string;
}

export interface Release {
  id: number;
  name: string;
  status: string;
  createdOn: string;
  modifiedOn: string;
  createdBy: { displayName: string; uniqueName: string };
  environments: Array<{
    id: number;
    name: string;
    status: string;
    deploySteps: Array<{
      id: number;
      deploymentId: number;
      attempt: number;
      status: string;
      requestedOn: string;
      lastModifiedOn: string;
    }>;
  }>;
  releaseDefinition: { id: number; name: string };
  artifacts: Array<{
    alias: string;
    type: string;
    definitionReference: Record<string, { id: string; name: string }>;
  }>;
  url: string;
  _links: { web: { href: string } };
}

// ═════════════════════════════════════════════════════════════════════════════
// Profile & Project
// ═════════════════════════════════════════════════════════════════════════════

export interface UserProfile {
  id: string;
  displayName: string;
  publicAlias: string;
  emailAddress: string;
  coreRevision: number;
  timeZone: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  visibility: string;
  lastUpdateTime: string;
  capabilities?: {
    versioncontrol: { sourceControlType: string };
    processTemplate: { templateName: string; templateTypeId: string };
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═════════════════════════════════════════════════════════════════════════════

type PatchOp = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

function field(name: string, value: unknown): PatchOp {
  return { op: "add", path: `/fields/${name}`, value };
}

// ═════════════════════════════════════════════════════════════════════════════
// Client
// ═════════════════════════════════════════════════════════════════════════════

export class AzureDevOpsClient {
  private readonly base: string;
  private readonly vsrmBase: string;
  private readonly headers: Record<string, string>;
  private readonly cfg: StoredAuth;
  readonly cache: Cache;

  constructor(cfg: StoredAuth) {
    this.cfg = cfg;
    this.base = `https://dev.azure.com/${cfg.org}`;
    this.vsrmBase = `https://vsrm.dev.azure.com/${cfg.org}`;
    this.headers = {
      Authorization: buildAuthHeader(cfg),
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    this.cache = new Cache();
  }

  // ── HTTP primitives ────────────────────────────────────────────────────────

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${url} → ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(
    url: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...this.headers, ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST ${url} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async patch<T>(
    url: string,
    body: unknown,
    contentType?: string,
  ): Promise<T> {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        ...this.headers,
        "Content-Type": contentType ?? "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PATCH ${url} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async del(url: string): Promise<void> {
    const res = await fetch(url, { method: "DELETE", headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DELETE ${url} → ${res.status}: ${text}`);
    }
  }

  // URL builders
  private apis(path: string) {
    return `${this.base}/${this.cfg.project}/_apis/${path}`;
  }
  private tapis(team: string, path: string) {
    return `${this.base}/${this.cfg.project}/${encodeURIComponent(team)}/_apis/${path}`;
  }
  private rmapis(path: string) {
    return `${this.vsrmBase}/${this.cfg.project}/_apis/${path}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE & PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getMyProfile(): Promise<UserProfile> {
    return this.cache.getOrFetch("user", TTL.USER, () =>
      this.get<UserProfile>(
        "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
      ),
    );
  }

  async getProjectInfo(): Promise<ProjectInfo> {
    return this.cache.getOrFetch(`project:${this.cfg.project}`, TTL.PROJECT, () =>
      this.get<ProjectInfo>(
        `${this.base}/_apis/projects/${encodeURIComponent(this.cfg.project)}?includeCapabilities=true&api-version=7.1`,
      ),
    );
  }

  /** Download any URL with auth headers — used to fetch inline images from work item HTML. */
  async downloadAttachment(url: string): Promise<{ data: string; mimeType: string } | null> {
    try {
      const res = await fetch(url, {
        headers: { Authorization: this.headers["Authorization"]!, Accept: "*/*" },
      });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") ?? "image/png";
      const mimeType = ct.split(";")[0]?.trim() ?? "image/png";
      const buf = await res.arrayBuffer();
      return { data: Buffer.from(buf).toString("base64"), mimeType };
    } catch {
      return null;
    }
  }

  async listProjects(): Promise<ProjectInfo[]> {
    const res = await this.get<{ value: ProjectInfo[] }>(
      `${this.base}/_apis/projects?api-version=7.1`,
    );
    return res.value;
  }

  async checkPermissions(): Promise<{
    profile: boolean;
    workItems: boolean;
    builds: boolean;
    releases: boolean;
    repos: boolean;
    boards: boolean;
    details: Record<string, string>;
  }> {
    const probe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        return { label, ok: true, msg: "✅ allowed" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const code = msg.match(/→ (\d+)/)?.[1];
        return {
          label,
          ok: false,
          msg:
            code === "401"
              ? "❌ unauthorized (invalid PAT or expired)"
              : code === "403"
                ? "⛔ forbidden (PAT missing this scope)"
                : code === "404"
                  ? "⚠️  not found (wrong org/project name?)"
                  : `❌ ${msg.slice(0, 80)}`,
        };
      }
    };

    const results = await Promise.all([
      probe("profile", () => this.getMyProfile()),
      probe("workItems", () =>
        this.queryWiql(
          `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.cfg.project}'`,
        ),
      ),
      probe("builds", () => this.listPipelines()),
      probe("releases", () => this.listReleaseDefinitions()),
      probe("repos", () => this.listRepositories()),
      probe("boards", () => this.listTeams()),
    ]);

    return {
      profile: results[0]!.ok,
      workItems: results[1]!.ok,
      builds: results[2]!.ok,
      releases: results[3]!.ok,
      repos: results[4]!.ok,
      boards: results[5]!.ok,
      details: Object.fromEntries(results.map((r) => [r.label, r.msg])),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORK ITEM TYPES & FIELDS
  // ═══════════════════════════════════════════════════════════════════════════

  async listWorkItemTypes(): Promise<WorkItemType[]> {
    const res = await this.get<{ value: WorkItemType[] }>(
      this.apis("wit/workitemtypes?api-version=7.1"),
    );
    return res.value;
  }

  async getWorkItemTypeFields(typeName: string): Promise<WorkItemTypeField[]> {
    const t = encodeURIComponent(typeName);
    const res = await this.get<{ value: WorkItemTypeField[] }>(
      this.apis(
        `wit/workitemtypes/${t}/fields?$expand=allowedValues&api-version=7.1`,
      ),
    );
    return res.value;
  }

  async listAllFields(): Promise<WorkItemField[]> {
    const res = await this.get<{ value: WorkItemField[] }>(
      this.apis("wit/fields?api-version=7.1"),
    );
    return res.value;
  }

  async getWorkItemTypeStates(
    typeName: string,
  ): Promise<Array<{ name: string; color: string; category: string }>> {
    const t = encodeURIComponent(typeName);
    const res = await this.get<{
      value: Array<{ name: string; color: string; category: string }>;
    }>(this.apis(`wit/workitemtypes/${t}/states?api-version=7.1`));
    return res.value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORK ITEMS — CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async createWorkItem(input: WorkItemCreate): Promise<WorkItem> {
    const ops: PatchOp[] = [field("System.Title", input.title)];

    if (input.description)
      ops.push(field("System.Description", input.description));
    if (input.assignedTo)
      ops.push(field("System.AssignedTo", input.assignedTo));
    if (input.priority !== undefined)
      ops.push(field("Microsoft.VSTS.Common.Priority", input.priority));
    if (input.tags) ops.push(field("System.Tags", input.tags));
    if (input.iterationPath)
      ops.push(field("System.IterationPath", input.iterationPath));
    if (input.areaPath) ops.push(field("System.AreaPath", input.areaPath));
    if (input.state) ops.push(field("System.State", input.state));
    if (input.storyPoints !== undefined)
      ops.push(
        field("Microsoft.VSTS.Scheduling.StoryPoints", input.storyPoints),
      );
    if (input.remainingWork !== undefined)
      ops.push(
        field("Microsoft.VSTS.Scheduling.RemainingWork", input.remainingWork),
      );
    if (input.originalEstimate !== undefined)
      ops.push(
        field(
          "Microsoft.VSTS.Scheduling.OriginalEstimate",
          input.originalEstimate,
        ),
      );
    if (input.acceptanceCriteria)
      ops.push(
        field(
          "Microsoft.VSTS.Common.AcceptanceCriteria",
          input.acceptanceCriteria,
        ),
      );
    if (input.startDate)
      ops.push(field("Microsoft.VSTS.Scheduling.StartDate", input.startDate));
    if (input.targetDate)
      ops.push(field("Microsoft.VSTS.Scheduling.TargetDate", input.targetDate));
    if (input.reproSteps)
      ops.push(field("Microsoft.VSTS.TCM.ReproSteps", input.reproSteps));
    if (input.systemInfo)
      ops.push(field("Microsoft.VSTS.TCM.SystemInfo", input.systemInfo));
    if (input.activity)
      ops.push(field("Microsoft.VSTS.Common.Activity", input.activity));
    if (input.parentId) {
      ops.push({
        op: "add",
        path: "/relations/-",
        value: {
          rel: "System.LinkTypes.Hierarchy-Reverse",
          url: this.apis(`wit/workItems/${input.parentId}`),
        },
      });
    }

    const type = encodeURIComponent(input.type);
    return this.patch<WorkItem>(
      this.apis(`wit/workitems/$${type}?api-version=7.1`),
      ops,
      "application/json-patch+json",
    );
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    return this.get<WorkItem>(
      this.apis(`wit/workitems/${id}?$expand=all&api-version=7.1`),
    );
  }

  async updateWorkItem(input: WorkItemUpdate): Promise<WorkItem> {
    const ops: PatchOp[] = [];

    if (input.title) ops.push(field("System.Title", input.title));
    if (input.description)
      ops.push(field("System.Description", input.description));
    if (input.assignedTo !== undefined)
      ops.push(field("System.AssignedTo", input.assignedTo));
    if (input.priority !== undefined)
      ops.push(field("Microsoft.VSTS.Common.Priority", input.priority));
    if (input.tags !== undefined) ops.push(field("System.Tags", input.tags));
    if (input.state) ops.push(field("System.State", input.state));
    if (input.iterationPath)
      ops.push(field("System.IterationPath", input.iterationPath));
    if (input.areaPath) ops.push(field("System.AreaPath", input.areaPath));
    if (input.storyPoints !== undefined)
      ops.push(
        field("Microsoft.VSTS.Scheduling.StoryPoints", input.storyPoints),
      );
    if (input.remainingWork !== undefined)
      ops.push(
        field("Microsoft.VSTS.Scheduling.RemainingWork", input.remainingWork),
      );
    if (input.originalEstimate !== undefined)
      ops.push(
        field(
          "Microsoft.VSTS.Scheduling.OriginalEstimate",
          input.originalEstimate,
        ),
      );
    if (input.completedWork !== undefined)
      ops.push(
        field("Microsoft.VSTS.Scheduling.CompletedWork", input.completedWork),
      );
    if (input.acceptanceCriteria)
      ops.push(
        field(
          "Microsoft.VSTS.Common.AcceptanceCriteria",
          input.acceptanceCriteria,
        ),
      );
    if (input.startDate)
      ops.push(field("Microsoft.VSTS.Scheduling.StartDate", input.startDate));
    if (input.targetDate)
      ops.push(field("Microsoft.VSTS.Scheduling.TargetDate", input.targetDate));
    if (input.comment)
      ops.push({
        op: "add",
        path: "/fields/System.History",
        value: input.comment,
      });

    return this.patch<WorkItem>(
      this.apis(`wit/workitems/${input.id}?api-version=7.1`),
      ops,
      "application/json-patch+json",
    );
  }

  async deleteWorkItem(id: number, destroy = false): Promise<void> {
    await this.del(
      this.apis(`wit/workitems/${id}?destroy=${destroy}&api-version=7.1`),
    );
  }

  async listWorkItemsById(ids: number[]): Promise<WorkItem[]> {
    if (ids.length === 0) return [];
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const pages = await Promise.all(
      chunks.map((c) =>
        this.get<{ value: WorkItem[] }>(
          this.apis(`wit/workitems?ids=${c.join(",")}&$expand=all&api-version=7.1`),
        ).then((r) => r.value),
      ),
    );
    return pages.flat();
  }

  async listWorkItems(opts: {
    assignedToMe?: boolean;
    currentSprint?: boolean;
    state?: string;
    type?: string;
    top?: number;
    ids?: number[];
  }): Promise<WorkItem[]> {
    if (opts.ids) return this.listWorkItemsById(opts.ids);

    const clauses: string[] = [`[System.TeamProject] = '${this.cfg.project}'`];
    if (opts.assignedToMe) {
      clauses.push("[System.AssignedTo] = @me");
      clauses.push("[System.State] <> 'Closed'");
    }
    if (opts.currentSprint) clauses.push("[System.IterationPath] = @CurrentIteration");
    if (opts.state) clauses.push(`[System.State] = '${opts.state}'`);
    if (opts.type) clauses.push(`[System.WorkItemType] = '${opts.type}'`);

    const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")} ORDER BY [System.ChangedDate] DESC`;
    const r = await this.queryWiql(wiql, opts.top ?? 30);
    return this.listWorkItemsById(r.workItems.map((w) => w.id));
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(workItemId: number): Promise<WorkItemComment[]> {
    const res = await this.get<{ comments: WorkItemComment[] }>(
      this.apis(
        `wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`,
      ),
    );
    return res.comments;
  }

  async addComment(workItemId: number, text: string): Promise<WorkItemComment> {
    return this.post<WorkItemComment>(
      this.apis(
        `wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`,
      ),
      { text },
    );
  }

  // ── History / revisions ────────────────────────────────────────────────────

  async getWorkItemHistory(id: number): Promise<
    Array<{
      rev: number;
      revisedDate: string;
      fields: Record<string, { oldValue: unknown; newValue: unknown }>;
    }>
  > {
    const res = await this.get<{
      value: Array<{
        rev: number;
        revisedDate: string;
        fields: Record<string, { oldValue: unknown; newValue: unknown }>;
      }>;
    }>(this.apis(`wit/workitems/${id}/revisions?api-version=7.1`));
    return res.value;
  }

  // ── Links ──────────────────────────────────────────────────────────────────

  async linkWorkItems(
    sourceId: number,
    targetId: number,
    linkType: string,
    comment?: string,
  ): Promise<WorkItem> {
    const ops: PatchOp[] = [
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: linkType,
          url: this.apis(`wit/workItems/${targetId}`),
          attributes: comment ? { comment } : {},
        },
      },
    ];
    return this.patch<WorkItem>(
      this.apis(`wit/workitems/${sourceId}?api-version=7.1`),
      ops,
      "application/json-patch+json",
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORK ITEMS — QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async queryWiql(wiql: string, top = 200): Promise<QueryResult> {
    return this.post<QueryResult>(
      this.apis(`wit/wiql?$top=${top}&api-version=7.1`),
      { query: wiql },
    );
  }

  async queryMyWorkItems(): Promise<WorkItem[]> {
    const r = await this.queryWiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.cfg.project}' AND [System.AssignedTo] = @me AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC`,
    );
    return this.listWorkItemsById(r.workItems.map((w) => w.id));
  }

  async queryByState(state: string, type?: string): Promise<WorkItem[]> {
    const typeFilter = type ? ` AND [System.WorkItemType] = '${type}'` : "";
    const r = await this.queryWiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.cfg.project}' AND [System.State] = '${state}'${typeFilter} ORDER BY [System.ChangedDate] DESC`,
    );
    return this.listWorkItemsById(r.workItems.map((w) => w.id));
  }

  async queryCurrentSprint(): Promise<WorkItem[]> {
    const r = await this.queryWiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.cfg.project}' AND [System.IterationPath] = @CurrentIteration ORDER BY [System.WorkItemType] ASC`,
    );
    return this.listWorkItemsById(r.workItems.map((w) => w.id));
  }

  async searchWorkItems(opts: {
    keyword: string;
    type?: string;
    state?: string;
    assignedTo?: string;
    top?: number;
  }): Promise<WorkItem[]> {
    const clauses: string[] = [
      `[System.TeamProject] = '${this.cfg.project}'`,
      `([System.Title] CONTAINS '${opts.keyword}' OR [System.Description] CONTAINS '${opts.keyword}')`,
    ];
    if (opts.type) clauses.push(`[System.WorkItemType] = '${opts.type}'`);
    if (opts.state) clauses.push(`[System.State] = '${opts.state}'`);
    if (opts.assignedTo)
      clauses.push(`[System.AssignedTo] = '${opts.assignedTo}'`);

    const r = await this.queryWiql(
      `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")} ORDER BY [System.ChangedDate] DESC`,
      opts.top ?? 50,
    );
    return this.listWorkItemsById(r.workItems.map((w) => w.id));
  }

  async listRecentWorkItems(type?: string, top = 30): Promise<WorkItem[]> {
    const typeFilter = type ? ` AND [System.WorkItemType] = '${type}'` : "";
    const r = await this.queryWiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.cfg.project}'${typeFilter} ORDER BY [System.ChangedDate] DESC`,
      top,
    );
    return this.listWorkItemsById(r.workItems.map((w) => w.id));
  }

  async getWorkItemChildren(parentId: number): Promise<WorkItem[]> {
    const wi = await this.getWorkItem(parentId);
    const ids = (wi.relations ?? [])
      .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
      .map((r) => Number(r.url.split("/").pop()))
      .filter(Boolean);
    return this.listWorkItemsById(ids);
  }

  async listWorkItemAttachments(id: number): Promise<WorkItemAttachment[]> {
    const wi = await this.getWorkItem(id);
    return (wi.relations ?? [])
      .filter((r) => r.rel === "AttachedFile")
      .map((r) => {
        const attrs = r.attributes as { name?: string; comment?: string };
        const guessed = decodeURIComponent(r.url.split("/").pop() ?? "");
        return {
          name: (attrs.name ?? guessed) || "attachment",
          url: r.url,
          comment: attrs.comment,
        };
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAMS & MEMBERS
  // ═══════════════════════════════════════════════════════════════════════════

  async listTeams(): Promise<Team[]> {
    return this.cache.getOrFetch(`teams:${this.cfg.project}`, TTL.TEAMS, async () => {
      const res = await this.get<{ value: Team[] }>(
        `${this.base}/_apis/projects/${encodeURIComponent(this.cfg.project)}/teams?api-version=7.1`,
      );
      return res.value;
    });
  }

  async getTeamMembers(team: string): Promise<TeamMember[]> {
    const t = encodeURIComponent(team);
    const res = await this.get<{ value: TeamMember[] }>(
      `${this.base}/_apis/projects/${encodeURIComponent(this.cfg.project)}/teams/${t}/members?api-version=7.1`,
    );
    return res.value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITERATIONS / SPRINTS
  // ═══════════════════════════════════════════════════════════════════════════

  async listIterations(team: string): Promise<Iteration[]> {
    const res = await this.get<{ value: Iteration[] }>(
      this.tapis(team, "work/teamsettings/iterations?api-version=7.1"),
    );
    return res.value;
  }

  async getCurrentIteration(team: string): Promise<Iteration | null> {
    return this.cache.getOrFetch(`sprint:${this.cfg.project}:${team}`, TTL.SPRINT, async () => {
      const res = await this.get<{ value: Iteration[] }>(
        this.tapis(team, "work/teamsettings/iterations?$timeframe=current&api-version=7.1"),
      );
      return res.value[0] ?? null;
    });
  }

  async listTeamCapacities(
    team: string,
    iterationId?: string,
  ): Promise<TeamCapacity[]> {
    const iterId = iterationId ?? (await this.getCurrentIteration(team))?.id;
    if (!iterId) return [];
    const res = await this.get<{ value: TeamCapacity[] }>(
      this.tapis(
        team,
        `work/teamsettings/iterations/${encodeURIComponent(iterId)}/capacities?api-version=7.1`,
      ),
    );
    return res.value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOARDS
  // ═══════════════════════════════════════════════════════════════════════════

  async listBoards(
    team: string,
  ): Promise<Array<{ id: string; name: string; url: string }>> {
    const res = await this.get<{
      value: Array<{ id: string; name: string; url: string }>;
    }>(this.tapis(team, "work/boards?api-version=7.1"));
    return res.value;
  }

  async getBoard(
    team: string,
    boardId: string,
  ): Promise<{ id: string; name: string; columns: BoardColumn[] }> {
    return this.get(this.tapis(team, `work/boards/${boardId}?api-version=7.1`));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKLOG
  // ═══════════════════════════════════════════════════════════════════════════

  async getBacklog(
    team: string,
    backlogLevel = "Microsoft.RequirementCategory",
  ): Promise<BacklogItem[]> {
    const res = await this.get<{
      workItems: Array<{ target: { id: number }; order: number }>;
    }>(
      this.tapis(
        team,
        `work/backlogs/${backlogLevel}/workItems?api-version=7.1`,
      ),
    );

    const ids = res.workItems.map((w) => w.target.id);
    const wis = await this.listWorkItemsById(ids);
    const orderMap = new Map(res.workItems.map((w) => [w.target.id, w.order]));

    return wis.map((wi) => ({
      id: wi.id,
      title: String(wi.fields["System.Title"] ?? ""),
      type: String(wi.fields["System.WorkItemType"] ?? ""),
      state: String(wi.fields["System.State"] ?? ""),
      assignedTo:
        (wi.fields["System.AssignedTo"] as { displayName?: string } | undefined)
          ?.displayName ?? "Unassigned",
      priority:
        (wi.fields["Microsoft.VSTS.Common.Priority"] as number | undefined) ??
        null,
      storyPoints:
        (wi.fields["Microsoft.VSTS.Scheduling.StoryPoints"] as
          | number
          | undefined) ?? null,
      order: orderMap.get(wi.id) ?? 0,
    }));
  }

  async listBacklogLevels(
    team: string,
  ): Promise<
    Array<{ id: string; name: string; rank: number; workItemTypes: string[] }>
  > {
    const res = await this.get<{
      value: Array<{
        id: string;
        name: string;
        rank: number;
        workItemTypes: Array<{ name: string }>;
      }>;
    }>(this.tapis(team, "work/backlogs?api-version=7.1"));
    return res.value.map((b) => ({
      id: b.id,
      name: b.name,
      rank: b.rank,
      workItemTypes: b.workItemTypes.map((t) => t.name),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA & ITERATION PATHS
  // ═══════════════════════════════════════════════════════════════════════════

  async listAreaPaths(): Promise<
    Array<{ id: string; name: string; path: string; hasChildren: boolean }>
  > {
    return this.cache.getOrFetch(`areas:${this.cfg.project}`, TTL.PATHS, async () => {
      type Node = { id: string; name: string; path: string; hasChildren: boolean; children?: Node[] };
      const root = await this.get<Node>(
        this.apis("wit/classificationnodes/areas?$depth=5&api-version=7.1"),
      );
      const acc: Node[] = [];
      const flatten = (n: Node) => { acc.push(n); n.children?.forEach(flatten); };
      flatten(root);
      return acc.map((n) => ({ id: n.id, name: n.name, path: n.path, hasChildren: n.hasChildren }));
    });
  }

  async listIterationPaths(): Promise<
    Array<{ id: string; name: string; path: string; startDate?: string; finishDate?: string }>
  > {
    return this.cache.getOrFetch(`iterations:${this.cfg.project}`, TTL.PATHS, async () => {
      type Node = {
        id: string; name: string; path: string; hasChildren: boolean;
        attributes?: { startDate?: string; finishDate?: string }; children?: Node[];
      };
      const root = await this.get<Node>(
        this.apis("wit/classificationnodes/iterations?$depth=5&api-version=7.1"),
      );
      const acc: Node[] = [];
      const flatten = (n: Node) => { acc.push(n); n.children?.forEach(flatten); };
      flatten(root);
      return acc.map((n) => ({
        id: n.id, name: n.name, path: n.path,
        startDate: n.attributes?.startDate, finishDate: n.attributes?.finishDate,
      }));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPOSITORIES
  // ═══════════════════════════════════════════════════════════════════════════

  async listRepositories(): Promise<Repository[]> {
    const res = await this.get<{ value: Repository[] }>(
      this.apis("git/repositories?api-version=7.1"),
    );
    return res.value;
  }

  async getRepository(repoId: string): Promise<Repository> {
    return this.get<Repository>(
      this.apis(`git/repositories/${repoId}?api-version=7.1`),
    );
  }

  async listBranches(repoId: string): Promise<Branch[]> {
    const res = await this.get<{ value: Branch[] }>(
      this.apis(`git/repositories/${repoId}/stats/branches?api-version=7.1`),
    );
    return res.value;
  }

  async listCommits(
    repoId: string,
    branch?: string,
    top = 20,
  ): Promise<GitCommit[]> {
    const branchFilter = branch
      ? `&searchCriteria.itemVersion.version=${encodeURIComponent(branch)}`
      : "";
    const res = await this.get<{ value: GitCommit[] }>(
      this.apis(
        `git/repositories/${repoId}/commits?$top=${top}${branchFilter}&api-version=7.1`,
      ),
    );
    return res.value;
  }

  async listPullRequests(
    repoId: string,
    status: "active" | "completed" | "abandoned" | "all" = "active",
  ): Promise<PullRequest[]> {
    const res = await this.get<{ value: PullRequest[] }>(
      this.apis(
        `git/repositories/${repoId}/pullrequests?searchCriteria.status=${status}&api-version=7.1`,
      ),
    );
    return res.value;
  }

  async getPullRequest(repoId: string, prId: number): Promise<PullRequest> {
    return this.get<PullRequest>(
      this.apis(
        `git/repositories/${repoId}/pullrequests/${prId}?api-version=7.1`,
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINES & BUILDS
  // ═══════════════════════════════════════════════════════════════════════════

  async listPipelines(): Promise<Pipeline[]> {
    const res = await this.get<{ value: Pipeline[] }>(
      this.apis("pipelines?api-version=7.1"),
    );
    return res.value;
  }

  async listBuilds(
    opts: {
      pipelineId?: number;
      branch?: string;
      status?: "all" | "inProgress" | "completed" | "cancelling" | "notStarted";
      result?: "succeeded" | "failed" | "canceled" | "partiallySucceeded";
      top?: number;
    } = {},
  ): Promise<Build[]> {
    const p = new URLSearchParams({ "api-version": "7.1" });
    if (opts.pipelineId) p.set("definitions", String(opts.pipelineId));
    if (opts.branch) p.set("branchName", opts.branch);
    if (opts.status) p.set("statusFilter", opts.status);
    if (opts.result) p.set("resultFilter", opts.result);
    if (opts.top) p.set("$top", String(opts.top));

    const res = await this.get<{ value: Build[] }>(
      this.apis(`build/builds?${p.toString()}`),
    );
    return res.value;
  }

  async getBuild(buildId: number): Promise<Build> {
    return this.get<Build>(
      this.apis(`build/builds/${buildId}?api-version=7.1`),
    );
  }

  async getBuildTimeline(buildId: number): Promise<BuildTimeline> {
    return this.get<BuildTimeline>(
      this.apis(`build/builds/${buildId}/timeline?api-version=7.1`),
    );
  }

  async getBuildLogs(buildId: number): Promise<BuildLog[]> {
    const res = await this.get<{ value: BuildLog[] }>(
      this.apis(`build/builds/${buildId}/logs?api-version=7.1`),
    );
    return res.value;
  }

  async getBuildLogContent(buildId: number, logId: number): Promise<string> {
    const res = await fetch(
      this.apis(`build/builds/${buildId}/logs/${logId}?api-version=7.1`),
      {
        headers: { ...this.headers, Accept: "text/plain" },
      },
    );
    if (!res.ok) throw new Error(`GET build log → ${res.status}`);
    return res.text();
  }

  async queueBuild(
    pipelineId: number,
    branch?: string,
    variables?: Record<string, string>,
  ): Promise<Build> {
    const body: Record<string, unknown> = { definition: { id: pipelineId } };
    if (branch) body["sourceBranch"] = branch;
    if (variables) body["parameters"] = JSON.stringify(variables);
    return this.post<Build>(this.apis("build/builds?api-version=7.1"), body);
  }

  async cancelBuild(buildId: number): Promise<void> {
    await this.patch(this.apis(`build/builds/${buildId}?api-version=7.1`), {
      status: "cancelling",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RELEASES
  // ═══════════════════════════════════════════════════════════════════════════

  async listReleaseDefinitions(): Promise<ReleaseDefinition[]> {
    const res = await this.get<{ value: ReleaseDefinition[] }>(
      this.rmapis("release/definitions?$expand=environments&api-version=7.1"),
    );
    return res.value;
  }

  async getReleaseDefinition(id: number): Promise<ReleaseDefinition> {
    return this.get<ReleaseDefinition>(
      this.rmapis(`release/definitions/${id}?api-version=7.1`),
    );
  }

  async listReleases(
    opts: {
      definitionId?: number;
      status?: "draft" | "active" | "abandoned";
      top?: number;
    } = {},
  ): Promise<Release[]> {
    const p = new URLSearchParams({
      "api-version": "7.1",
      $expand: "environments",
    });
    if (opts.definitionId) p.set("definitionId", String(opts.definitionId));
    if (opts.status) p.set("statusFilter", opts.status);
    if (opts.top) p.set("$top", String(opts.top));

    const res = await this.get<{ value: Release[] }>(
      this.rmapis(`release/releases?${p.toString()}`),
    );
    return res.value;
  }

  async getRelease(releaseId: number): Promise<Release> {
    return this.get<Release>(
      this.rmapis(`release/releases/${releaseId}?api-version=7.1`),
    );
  }

  async createRelease(
    definitionId: number,
    description?: string,
    artifacts?: Array<{
      alias: string;
      instanceReference: { id: string; name: string };
    }>,
  ): Promise<Release> {
    return this.post<Release>(this.rmapis("release/releases?api-version=7.1"), {
      definitionId,
      description: description ?? "",
      artifacts: artifacts ?? [],
      isDraft: false,
      reason: "manual",
      manualEnvironments: [],
    });
  }
}
