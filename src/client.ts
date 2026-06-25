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

/**
 * Minimal field set for list/search views — everything `fmtWI` renders, nothing
 * more. Fetching these via `fields=` instead of `$expand=all` cuts the response
 * payload by an order of magnitude (no rich-text bodies, no relations), making
 * list calls both faster and far lighter on context.
 */
export const LIST_FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AssignedTo",
  "System.IterationPath",
  "Microsoft.VSTS.Scheduling.StoryPoints",
  "Microsoft.VSTS.Common.Priority",
] as const;

/** Max work-item IDs fetched per WIQL query when paginating (IDs are cheap). */
const WIQL_ID_CAP = 500;

// ── Transient-failure retry ───────────────────────────────────────────────────
// Azure DevOps throttles aggressively (429) and occasionally returns gateway
// errors. These are transient — retry with exponential backoff + jitter rather
// than surfacing a hard failure to the model.
const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter: ~300ms, ~600ms, ~1200ms (±25%). */
function backoffMs(attempt: number): number {
  const base = BACKOFF_BASE_MS * 2 ** attempt;
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/**
 * Escape a value for safe interpolation into a single-quoted WIQL string
 * literal. WIQL escapes a quote by doubling it. Prevents a stray apostrophe in
 * a keyword (e.g. "user's bug") from breaking the query or injecting clauses.
 */
function wiqlEsc(value: string): string {
  return value.replace(/'/g, "''");
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

  get org(): string { return this.cfg.org; }
  get project(): string | undefined { return this.cfg.project; }

  /** Throws a friendly error if no project has been selected yet. */
  private requireProject(): string {
    if (!this.cfg.project) {
      throw new Error(
        "No project selected. Call switch_project to pick one from your org.",
      );
    }
    return this.cfg.project;
  }

  /** Persist a newly selected project into the stored auth file. */
  async setProject(project: string): Promise<void> {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const authFile = join(process.env["HOME"] ?? "~", ".azure-mcp-auth.json");
    this.cfg.project = project;
    await writeFile(authFile, JSON.stringify(this.cfg, null, 2), { mode: 0o600 });
    this.cache.invalidate(); // stale project context
  }

  // ── HTTP primitives ────────────────────────────────────────────────────────

  /**
   * fetch() with automatic retry on transient failures (429 + gateway errors)
   * and network exceptions. Honors the `Retry-After` header when present,
   * otherwise falls back to exponential backoff. Returns the final Response —
   * callers handle non-retryable error statuses themselves.
   */
  private async request(url: string, init?: RequestInit): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, init);
        if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const delay =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : backoffMs(attempt);
          await sleep(delay);
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e; // network error — retry
        if (attempt >= MAX_RETRIES) break;
        await sleep(backoffMs(attempt));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Request to ${url} failed after ${MAX_RETRIES} retries`);
  }

  private async get<T>(url: string): Promise<T> {
    const res = await this.request(url, { headers: this.headers });
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
    const res = await this.request(url, {
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
    const res = await this.request(url, {
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
    const res = await this.request(url, { method: "DELETE", headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DELETE ${url} → ${res.status}: ${text}`);
    }
  }

  // URL builders — all call requireProject() so callers don't need to
  private apis(path: string) {
    return `${this.base}/${this.requireProject()}/_apis/${path}`;
  }
  private tapis(team: string, path: string) {
    return `${this.base}/${this.requireProject()}/${encodeURIComponent(team)}/_apis/${path}`;
  }
  private rmapis(path: string) {
    return `${this.vsrmBase}/${this.requireProject()}/_apis/${path}`;
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
    const p = this.requireProject();
    return this.cache.getOrFetch(`project:${p}`, TTL.PROJECT, () =>
      this.get<ProjectInfo>(
        `${this.base}/_apis/projects/${encodeURIComponent(p)}?includeCapabilities=true&api-version=7.1`,
      ),
    );
  }

  /** Download any URL with auth headers — used to fetch inline images from work item HTML. */
  async downloadAttachment(url: string): Promise<{ data: string; mimeType: string } | null> {
    try {
      const res = await this.request(url, {
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
          `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.requireProject()}'`,
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
    return this.cache.getOrFetch(`wi:${id}`, TTL.WI, () =>
      this.get<WorkItem>(this.apis(`wit/workitems/${id}?$expand=all&api-version=7.1`)),
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

  /**
   * Batch-fetch work items by ID. Pass `fields` to project only specific fields
   * (much smaller payload); omit it for the full `$expand=all` view (all fields
   * + relations) used by detail views. Results preserve the requested ID order.
   */
  async listWorkItemsById(
    ids: number[],
    opts: { fields?: readonly string[] } = {},
  ): Promise<WorkItem[]> {
    if (ids.length === 0) return [];
    const select = opts.fields?.length
      ? `fields=${opts.fields.join(",")}&errorPolicy=omit`
      : "$expand=all";
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const pages = await Promise.all(
      chunks.map((c) =>
        this.get<{ value: WorkItem[] }>(
          this.apis(`wit/workitems?ids=${c.join(",")}&${select}&api-version=7.1`),
        ).then((r) => r.value),
      ),
    );
    const all = pages.flat();
    // The batch endpoint may not honor request order — re-sort to match `ids`.
    const byId = new Map(all.map((w) => [w.id, w]));
    return ids.map((id) => byId.get(id)).filter((w): w is WorkItem => w != null);
  }

  /** Build the WIQL SELECT for the list_work_items filter set. */
  buildListWiql(opts: {
    assignedToMe?: boolean;
    currentSprint?: boolean;
    state?: string;
    type?: string;
  }): string {
    const clauses: string[] = [`[System.TeamProject] = '${wiqlEsc(this.cfg.project ?? "")}'`];
    if (opts.assignedToMe) {
      clauses.push("[System.AssignedTo] = @me");
      clauses.push("[System.State] <> 'Closed'");
    }
    if (opts.currentSprint) clauses.push("[System.IterationPath] = @CurrentIteration");
    if (opts.state) clauses.push(`[System.State] = '${wiqlEsc(opts.state)}'`);
    if (opts.type) clauses.push(`[System.WorkItemType] = '${wiqlEsc(opts.type)}'`);
    return `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")} ORDER BY [System.ChangedDate] DESC`;
  }

  /** Build the WIQL SELECT for the keyword search. */
  buildSearchWiql(opts: {
    keyword: string;
    type?: string;
    state?: string;
    assignedTo?: string;
  }): string {
    const kw = wiqlEsc(opts.keyword);
    const clauses: string[] = [
      `[System.TeamProject] = '${wiqlEsc(this.cfg.project ?? "")}'`,
      `([System.Title] CONTAINS '${kw}' OR [System.Description] CONTAINS '${kw}')`,
    ];
    if (opts.type) clauses.push(`[System.WorkItemType] = '${wiqlEsc(opts.type)}'`);
    if (opts.state) clauses.push(`[System.State] = '${wiqlEsc(opts.state)}'`);
    if (opts.assignedTo) clauses.push(`[System.AssignedTo] = '${wiqlEsc(opts.assignedTo)}'`);
    return `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")} ORDER BY [System.ChangedDate] DESC`;
  }

  /**
   * Run a WIQL query and return the matching IDs, cached briefly so paging
   * through a result set doesn't re-hit the API on every page turn.
   */
  async queryWiqlIds(wiql: string, cap = WIQL_ID_CAP): Promise<number[]> {
    return this.cache.getOrFetch(`wiql:${cap}:${wiql}`, TTL.WI_LIST, async () => {
      const r = await this.queryWiql(wiql, cap);
      return r.workItems.map((w) => w.id);
    });
  }

  /**
   * Paginated work-item fetch: query IDs once (cheap + cached), slice to the
   * requested page, then hydrate ONLY that page with the compact field set.
   * Returns the page plus the total match count for "showing X of N" output.
   */
  async pagedWorkItems(
    wiql: string,
    opts: { skip?: number; top?: number; fields?: readonly string[] } = {},
  ): Promise<{ items: WorkItem[]; total: number; skip: number; capped: boolean }> {
    const ids = await this.queryWiqlIds(wiql);
    const skip = Math.max(0, opts.skip ?? 0);
    const top = Math.max(1, opts.top ?? 15);
    const page = ids.slice(skip, skip + top);
    const items = await this.listWorkItemsById(page, {
      fields: opts.fields ?? LIST_FIELDS,
    });
    return { items, total: ids.length, skip, capped: ids.length >= WIQL_ID_CAP };
  }

  async listWorkItems(opts: {
    assignedToMe?: boolean;
    currentSprint?: boolean;
    state?: string;
    type?: string;
    top?: number;
    ids?: number[];
  }): Promise<WorkItem[]> {
    if (opts.ids) return this.listWorkItemsById(opts.ids, { fields: LIST_FIELDS });
    const ids = await this.queryWiqlIds(this.buildListWiql(opts));
    return this.listWorkItemsById(ids.slice(0, opts.top ?? 30), { fields: LIST_FIELDS });
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(workItemId: number): Promise<WorkItemComment[]> {
    return this.cache.getOrFetch(`wi-comments:${workItemId}`, TTL.WI, async () => {
      const res = await this.get<{ comments: WorkItemComment[] }>(
        this.apis(`wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`),
      );
      return res.comments;
    });
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
      revisedBy?: { displayName: string };
      fields: Record<string, { oldValue?: unknown; newValue?: unknown }>;
    }>
  > {
    // The "updates" endpoint returns per-revision field diffs (old→new),
    // which is what a change history should show — far smaller than full
    // "revisions" snapshots.
    const res = await this.get<{
      value: Array<{
        rev: number;
        revisedDate: string;
        revisedBy?: { displayName: string };
        fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
      }>;
    }>(this.apis(`wit/workitems/${id}/updates?api-version=7.1`));
    return res.value.map((u) => ({
      rev: u.rev,
      revisedDate: u.revisedDate,
      revisedBy: u.revisedBy,
      fields: u.fields ?? {},
    }));
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
    const ids = await this.queryWiqlIds(this.buildSearchWiql(opts));
    return this.listWorkItemsById(ids.slice(0, opts.top ?? 50), { fields: LIST_FIELDS });
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
    const project = this.requireProject();
    return this.cache.getOrFetch(`teams:${project}`, TTL.TEAMS, async () => {
      const res = await this.get<{ value: Team[] }>(
        `${this.base}/_apis/projects/${encodeURIComponent(project)}/teams?api-version=7.1`,
      );
      return res.value;
    });
  }

  async getTeamMembers(team: string): Promise<TeamMember[]> {
    const project = this.requireProject();
    const t = encodeURIComponent(team);
    const res = await this.get<{ value: TeamMember[] }>(
      `${this.base}/_apis/projects/${encodeURIComponent(project)}/teams/${t}/members?api-version=7.1`,
    );
    return res.value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITERATIONS / SPRINTS
  // ═══════════════════════════════════════════════════════════════════════════

  async listIterations(team: string): Promise<Iteration[]> {
    return this.cache.getOrFetch(`iters:${this.cfg.project}:${team}`, TTL.ITERS, async () => {
      const res = await this.get<{ value: Iteration[] }>(
        this.tapis(team, "work/teamsettings/iterations?api-version=7.1"),
      );
      return res.value;
    });
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
    return this.cache.getOrFetch(`repos:${this.cfg.project}`, TTL.REPOS, async () => {
      const res = await this.get<{ value: Repository[] }>(
        this.apis("git/repositories?api-version=7.1"),
      );
      return res.value;
    });
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
    skip = 0,
  ): Promise<GitCommit[]> {
    const p = new URLSearchParams({
      "api-version": "7.1",
      "searchCriteria.$top": String(top),
    });
    if (skip > 0) p.set("searchCriteria.$skip", String(skip));
    if (branch) p.set("searchCriteria.itemVersion.version", branch);
    const res = await this.get<{ value: GitCommit[] }>(
      this.apis(`git/repositories/${repoId}/commits?${p.toString()}`),
    );
    return res.value;
  }

  async listPullRequests(
    repoId: string,
    status: "active" | "completed" | "abandoned" | "all" = "active",
    top = 20,
    skip = 0,
  ): Promise<PullRequest[]> {
    const p = new URLSearchParams({
      "api-version": "7.1",
      "searchCriteria.status": status,
      "$top": String(top),
    });
    if (skip > 0) p.set("$skip", String(skip));
    const res = await this.get<{ value: PullRequest[] }>(
      this.apis(`git/repositories/${repoId}/pullrequests?${p.toString()}`),
    );
    return res.value;
  }

  async getPullRequest(repoId: string, prId: number): Promise<PullRequest> {
    return this.get<PullRequest>(
      this.apis(`git/repositories/${repoId}/pullrequests/${prId}?api-version=7.1`),
    );
  }

  async createPullRequest(opts: {
    repoId: string;
    title: string;
    sourceBranch: string;
    targetBranch: string;
    description?: string;
    reviewers?: string[];
    isDraft?: boolean;
    workItemIds?: number[];
  }): Promise<PullRequest> {
    const body: Record<string, unknown> = {
      title: opts.title,
      sourceRefName: opts.sourceBranch.startsWith("refs/") ? opts.sourceBranch : `refs/heads/${opts.sourceBranch}`,
      targetRefName: opts.targetBranch.startsWith("refs/") ? opts.targetBranch : `refs/heads/${opts.targetBranch}`,
      isDraft: opts.isDraft ?? false,
    };
    if (opts.description) body["description"] = opts.description;
    if (opts.reviewers?.length) body["reviewers"] = opts.reviewers.map((id) => ({ id }));
    if (opts.workItemIds?.length) {
      body["workItemRefs"] = opts.workItemIds.map((id) => ({
        id: String(id),
        url: this.apis(`wit/workItems/${id}`),
      }));
    }
    return this.post<PullRequest>(
      this.apis(`git/repositories/${opts.repoId}/pullrequests?api-version=7.1`),
      body,
    );
  }

  async getFileContent(
    repoId: string,
    path: string,
    branch?: string,
  ): Promise<{ content: string; isBinary: boolean; path: string; commitId: string }> {
    const p = new URLSearchParams({
      path,
      "api-version": "7.1",
      "$format": "text",
    });
    if (branch) p.set("versionDescriptor.version", branch);
    const res = await this.request(this.apis(`git/repositories/${repoId}/items?${p}`), {
      headers: { ...this.headers, Accept: "text/plain" },
    });
    if (!res.ok) throw new Error(`GET file "${path}" → ${res.status}: ${await res.text()}`);
    const commitId = res.headers.get("x-ms-gitcommitid") ?? "";
    const contentType = res.headers.get("content-type") ?? "";
    const isBinary = !contentType.includes("text") && !path.match(/\.(ts|tsx|js|jsx|json|md|yml|yaml|css|html|xml|sh|py|go|rs|rb|java|cs|cpp|c|h|txt|env|gitignore|dockerfile)$/i);
    const content = isBinary ? "[binary file — cannot display]" : await res.text();
    return { content, isBinary, path, commitId };
  }

  async listFiles(
    repoId: string,
    path = "/",
    branch?: string,
  ): Promise<Array<{ path: string; isFolder: boolean; size?: number }>> {
    const p = new URLSearchParams({
      scopePath: path,
      recursionLevel: "oneLevel",
      "api-version": "7.1",
    });
    if (branch) p.set("versionDescriptor.version", branch);
    const res = await this.get<{
      value: Array<{ path: string; isFolder: boolean; size?: number }>;
    }>(this.apis(`git/repositories/${repoId}/items?${p}`));
    return res.value.filter((f) => f.path !== path);
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
    const res = await this.request(
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
