// ─── Auth management ─────────────────────────────────────────────────────────
// Supports PAT (default) and OAuth device code flow (--oauth / AZURE_CLIENT_ID)
// Token stored at ~/.azure-mcp-auth.json with 0600 permissions

import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import * as readline from "node:readline/promises";

const AUTH_FILE = join(process.env["HOME"] ?? "~", ".azure-mcp-auth.json");

// ── Azure DevOps resource ID in AAD ──────────────────────────────────────────
const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";
const ADO_SCOPES_FULL = [
  `${ADO_RESOURCE}/vso.work_write`,
  `${ADO_RESOURCE}/vso.build_execute`,
  `${ADO_RESOURCE}/vso.code`,
];
const ADO_SCOPES_READONLY = [
  `${ADO_RESOURCE}/vso.work`,
  `${ADO_RESOURCE}/vso.code`,
];

// ═════════════════════════════════════════════════════════════════════════════

export interface StoredAuth {
  type: "pat" | "oauth";
  org: string;
  project: string;
  token: string;
  expiresAt?: number;
  displayName?: string;
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadAuth(): Promise<StoredAuth | null> {
  // Env vars take priority — useful for CI / Docker
  if (process.env["AZURE_PAT"] && process.env["AZURE_ORG"] && process.env["AZURE_PROJECT"]) {
    return {
      type: "pat",
      org: process.env["AZURE_ORG"],
      project: process.env["AZURE_PROJECT"],
      token: process.env["AZURE_PAT"],
    };
  }
  if (process.env["AUTH_TOKEN"] && process.env["AZURE_ORG"] && process.env["AZURE_PROJECT"]) {
    return {
      type: "oauth",
      org: process.env["AZURE_ORG"],
      project: process.env["AZURE_PROJECT"],
      token: process.env["AUTH_TOKEN"],
    };
  }
  try {
    const raw = await readFile(AUTH_FILE, "utf8");
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

async function save(auth: StoredAuth): Promise<void> {
  await writeFile(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

// ── CLI commands ──────────────────────────────────────────────────────────────

export async function cmdLogout(): Promise<void> {
  try {
    await unlink(AUTH_FILE);
    console.log(`Logged out (removed ${AUTH_FILE})`);
  } catch {
    console.log("No stored credentials found.");
  }
}

export async function cmdCheck(): Promise<void> {
  const auth = await loadAuth();
  if (!auth) {
    console.log("Not authenticated.\nRun: npx azure-board-mcp authenticate");
    return;
  }

  console.log("\nAuthentication Status");
  console.log("─────────────────────");
  console.log(`  Type:    ${auth.type.toUpperCase()}`);
  console.log(`  Org:     ${auth.org}`);
  console.log(`  Project: ${auth.project}`);
  if (auth.displayName) console.log(`  User:    ${auth.displayName}`);
  if (auth.expiresAt) {
    const expired = auth.expiresAt < Date.now();
    const dt = new Date(auth.expiresAt).toISOString().slice(0, 16);
    console.log(`  Expires: ${dt}${expired ? " (EXPIRED)" : ""}`);
  }

  const header = buildAuthHeader(auth);
  const res = await fetch(
    "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
    { headers: { Authorization: header, Accept: "application/json" } },
  );
  if (res.ok) {
    const p = (await res.json()) as { displayName: string; emailAddress: string };
    console.log(`\n  ✓ Token valid — ${p.displayName} (${p.emailAddress})`);
  } else {
    console.log(`\n  ✗ Token invalid (${res.status} ${res.statusText})`);
  }
}

export async function cmdAuthenticate(opts: { oauth?: boolean; readOnly?: boolean }): Promise<void> {
  if (opts.oauth || process.env["AZURE_CLIENT_ID"]) {
    await flowOAuth(opts.readOnly ?? false);
  } else {
    await flowPat();
  }
}

// ── PAT flow ──────────────────────────────────────────────────────────────────

async function flowPat(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nAzure DevOps Authentication (PAT)");
  console.log("──────────────────────────────────");
  console.log("Create a token at: https://dev.azure.com/{org}/_usersSettings/tokens");
  console.log("Required scopes:   Work Items (Read & Write)  ·  Build (Read)  ·  Code (Read)\n");

  const org = (await rl.question("Organization name: ")).trim();
  const project = (await rl.question("Project name:      ")).trim();
  const pat = (await rl.question("PAT token:         ")).trim();
  rl.close();

  if (!org || !project || !pat) {
    console.error("All fields are required.");
    process.exit(1);
  }

  process.stdout.write("\nValidating… ");
  const token = Buffer.from(`:${pat}`).toString("base64");
  const res = await fetch(
    "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
    { headers: { Authorization: `Basic ${token}`, Accept: "application/json" } },
  );
  if (!res.ok) {
    process.stdout.write("failed.\n");
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const p = (await res.json()) as { displayName: string; emailAddress: string };
  process.stdout.write("ok.\n");

  await save({ type: "pat", org, project, token: pat, displayName: p.displayName });

  console.log(`\n✓  Authenticated as ${p.displayName} (${p.emailAddress})`);
  console.log(`   Org: ${org} / Project: ${project}`);
  console.log(`   Stored at ${AUTH_FILE}\n`);
}

// ── OAuth device-code flow ────────────────────────────────────────────────────

async function flowOAuth(readOnly: boolean): Promise<void> {
  const clientId = process.env["AZURE_CLIENT_ID"];
  if (!clientId) {
    console.error(
      [
        "AZURE_CLIENT_ID is required for OAuth flow.",
        "",
        "Register an Azure AD app:",
        "  1. https://portal.azure.com → Azure Active Directory → App registrations → New",
        "  2. Type: Public client/native",
        "  3. API permissions: Azure DevOps → user_impersonation (delegated)",
        "  4. Mobile and desktop flows: enabled",
        "",
        "Then set:  export AZURE_CLIENT_ID=<your-client-id>",
        "",
        "Or use PAT mode (no app needed):  npx azure-board-mcp authenticate",
      ].join("\n"),
    );
    process.exit(1);
  }

  const { PublicClientApplication } = (await import("@azure/msal-node")) as typeof import("@azure/msal-node");

  const pca = new PublicClientApplication({
    auth: { clientId, authority: "https://login.microsoftonline.com/organizations" },
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const org = (await rl.question("Organization name: ")).trim();
  const project = (await rl.question("Project name:      ")).trim();
  rl.close();

  const scopes = readOnly ? ADO_SCOPES_READONLY : ADO_SCOPES_FULL;

  const result = await pca.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (r) => console.log(`\n${r.message}\n`),
  });

  if (!result) {
    console.error("OAuth authentication failed.");
    process.exit(1);
  }

  await save({
    type: "oauth",
    org,
    project,
    token: result.accessToken,
    expiresAt: result.expiresOn?.getTime(),
    displayName: result.account?.name ?? undefined,
  });

  console.log(`\n✓  Authenticated as ${result.account?.name ?? "(unknown)"}`);
  console.log(`   Org: ${org} / Project: ${project}\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildAuthHeader(auth: StoredAuth): string {
  return auth.type === "oauth"
    ? `Bearer ${auth.token}`
    : `Basic ${Buffer.from(`:${auth.token}`).toString("base64")}`;
}
