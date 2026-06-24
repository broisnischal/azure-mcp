// ─── Auth management ─────────────────────────────────────────────────────────
// PAT: ask org + PAT, validate, list projects → user picks
// OAuth: browser auth-code + PKCE, list orgs → user picks org, list projects → user picks
// Token stored at ~/.azure-mcp-auth.json (mode 0600)

import { readFile, writeFile, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { join } from "node:path";
import * as readline from "node:readline/promises";

const AUTH_FILE = join(process.env["HOME"] ?? "~", ".azure-mcp-auth.json");

// Bundled Azure AD app — registered by the azure-board-mcp project.
// Multitenant public client: any Azure AD work account can sign in.
// No secret needed — safe to ship in the binary.
// Users can override with AZURE_CLIENT_ID + AZURE_TENANT_ID to use their own app.
const BUNDLED_CLIENT_ID = "e2ba32e7-6d24-4919-ba7b-37199c495247";
const BUNDLED_TENANT_ID = "organizations"; // accepts any Azure AD tenant

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
  project?: string;   // set on first use via switch_project tool
  token: string;
  expiresAt?: number;
  displayName?: string;
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadAuth(): Promise<StoredAuth | null> {
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

export async function cmdAuthenticate(opts: {
  pat?: boolean;
  readOnly?: boolean;
  clientId?: string;
  tenantId?: string;
}): Promise<void> {
  if (opts.pat) {
    await flowPat();
  } else {
    await flowOAuth(opts.readOnly ?? false, opts.clientId, opts.tenantId);
  }
}

// ── PAT flow ──────────────────────────────────────────────────────────────────

async function flowPat(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nAzure DevOps Authentication (PAT)");
  console.log("──────────────────────────────────");
  console.log("Required scopes: Work Items (Read & Write)  ·  Build (Read)  ·  Code (Read)\n");

  const org = (await rl.question("Organization name: ")).trim();
  if (!org) { console.error("Organization is required."); process.exit(1); }

  // Open the browser to the exact token creation page for this org
  const tokenUrl = `https://dev.azure.com/${org}/_usersSettings/tokens`;
  console.log(`\nOpening token page: ${tokenUrl}`);
  openBrowser(tokenUrl);

  const pat = (await rl.question("\nPaste PAT token:   ")).trim();
  rl.close();

  if (!pat) { console.error("PAT is required."); process.exit(1); }

  process.stdout.write("\nValidating… ");
  const b64 = Buffer.from(`:${pat}`).toString("base64");
  const headers = { Authorization: `Basic ${b64}`, Accept: "application/json" };

  // Validate against the org endpoint — works for both org-scoped and all-orgs PATs
  const connRes = await fetch(
    `https://dev.azure.com/${org}/_apis/connectionData?api-version=7.1`,
    { headers },
  );
  if (!connRes.ok) {
    process.stdout.write("failed.\n");
    console.error(`HTTP ${connRes.status} — PAT may be expired, wrong org, or missing scopes.`);
    console.error(`Verify at: ${tokenUrl}`);
    process.exit(1);
  }
  const conn = (await connRes.json()) as { authenticatedUser?: { providerDisplayName?: string; subjectDescriptor?: string } };
  const displayName = conn.authenticatedUser?.providerDisplayName ?? "unknown";
  process.stdout.write("ok.\n");
  console.log(`\nAuthenticated as ${displayName}\n`);

  await save({ type: "pat", org, token: pat, displayName });

  console.log(`\n✓  Saved  —  ${org}`);
  console.log(`   No project selected yet — the AI will ask you when the MCP starts.`);
  console.log(`   Stored at ${AUTH_FILE}\n`);
}

// ── OAuth browser flow (pure fetch — no MSAL) ────────────────────────────────

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function flowOAuth(readOnly: boolean, clientIdArg?: string, tenantIdArg?: string): Promise<void> {
  // Priority: CLI flag → env var → bundled default
  const clientId = clientIdArg ?? process.env["AZURE_CLIENT_ID"] ?? BUNDLED_CLIENT_ID;
  const tenantId = tenantIdArg ?? process.env["AZURE_TENANT_ID"] ?? BUNDLED_TENANT_ID;

  if (clientIdArg || tenantIdArg) {
    console.log(`Using custom app: client=${clientId} tenant=${tenantId}`);
  }
  const scopes = readOnly ? ADO_SCOPES_READONLY : ADO_SCOPES_FULL;
  const allScopes = [...scopes, "openid", "profile", "offline_access"].join(" ");

  const port = await findFreePort();
  const redirectUri = `http://localhost:${port}`;

  const { verifier, challenge } = generatePkce();
  const state = randomBytes(16).toString("hex");

  // Build authorization URL manually
  const authParams = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: allScopes,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${authParams}`;

  console.log("\nOpening browser for Azure sign-in…");
  console.log("If it doesn't open, visit:\n");
  console.log(`  ${authUrl}\n`);
  openBrowser(authUrl);

  const code = await waitForAuthCode(port, state);

  // Exchange code for token with a plain POST — no MSAL, no client_secret needed
  process.stdout.write("Exchanging code for token… ");
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: allScopes,
      }).toString(),
    },
  );

  if (!tokenRes.ok) {
    process.stdout.write("failed.\n");
    const err = (await tokenRes.json().catch(() => ({}))) as { error?: string; error_description?: string };
    console.error(`\n${err.error ?? "unknown_error"}: ${err.error_description ?? tokenRes.statusText}`);
    process.exit(1);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
    id_token?: string;
  };
  process.stdout.write("ok.\n");

  const accessToken = tokenData.access_token;
  const expiresAt = Date.now() + tokenData.expires_in * 1000;

  // Extract display name from JWT payload
  let displayName = "(unknown)";
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString()) as {
      name?: string; upn?: string; unique_name?: string;
    };
    displayName = payload.name ?? payload.upn ?? payload.unique_name ?? "(unknown)";
  } catch { /* ignore */ }

  console.log(`\nSigned in as ${displayName}\n`);

  const bearerHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  // Get the user's organizations
  let org: string;
  const profileRes = await fetch(
    "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
    { headers: bearerHeaders },
  );
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as { publicAlias: string };
    const accountsRes = await fetch(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.publicAlias}&api-version=7.1`,
      { headers: bearerHeaders },
    );
    if (accountsRes.ok) {
      const accounts = (await accountsRes.json()) as { value: Array<{ accountName: string }> };
      org = await pickFromList("Organization", accounts.value.map((a) => a.accountName));
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      org = (await rl.question("Organization name: ")).trim();
      rl.close();
    }
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    org = (await rl.question("Organization name: ")).trim();
    rl.close();
  }

  await save({ type: "oauth", org, token: accessToken, expiresAt, displayName });

  console.log(`\n✓  Saved  —  ${org}`);
  console.log(`   No project selected yet — the AI will ask you when the MCP starts.`);
  console.log(`   Stored at ${AUTH_FILE}\n`);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Fetch the project list for an org and let the user pick one. */
async function pickProject(org: string, headers: Record<string, string>): Promise<string> {
  process.stdout.write(`Fetching projects for "${org}"… `);
  const res = await fetch(
    `https://dev.azure.com/${org}/_apis/projects?$top=200&api-version=7.1`,
    { headers },
  );
  if (!res.ok) {
    process.stdout.write("failed.\n");
    console.error(`Could not list projects: HTTP ${res.status}`);
    // Fall back to manual entry
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const proj = (await rl.question("Project name: ")).trim();
    rl.close();
    return proj;
  }
  const data = (await res.json()) as { value: Array<{ name: string }> };
  process.stdout.write("ok.\n");
  return pickFromList("Project", data.value.map((p) => p.name));
}

/** Print a numbered list and return the chosen item. Auto-selects if only one. */
async function pickFromList(label: string, items: string[]): Promise<string> {
  if (items.length === 0) {
    console.error(`No ${label.toLowerCase()}s found.`);
    process.exit(1);
  }
  if (items.length === 1) {
    console.log(`${label}: ${items[0]} (only one found, auto-selected)`);
    return items[0]!;
  }

  console.log(`\n${label}s:`);
  items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let chosen: string | undefined;
  while (!chosen) {
    const answer = (await rl.question(`\nChoose ${label} (1-${items.length}): `)).trim();
    const n = parseInt(answer, 10);
    if (n >= 1 && n <= items.length) chosen = items[n - 1];
    else console.log(`  Please enter a number between 1 and ${items.length}.`);
  }
  rl.close();
  return chosen;
}

/** Find a free TCP port by binding to :0. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** Spin up a one-shot HTTP server, wait for the OAuth callback, return the auth code. */
function waitForAuthCode(port: number, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state");

      const html = (msg: string, ok: boolean) =>
        `<html><head><title>Azure DevOps MCP</title></head><body style="font-family:sans-serif;padding:40px">` +
        `<h2 style="color:${ok ? "#107c10" : "#a80000"}">${msg}</h2>` +
        `<p>You can close this tab and return to the terminal.</p></body></html>`;

      if (code && state === expectedState) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html("Authentication successful!", true));
        srv.close();
        resolve(code);
      } else if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(html(`Authentication failed: ${error}`, false));
        srv.close();
        reject(new Error(error));
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(html("Unexpected request.", false));
      }
    });
    srv.listen(port, "127.0.0.1");
    srv.on("error", reject);

    // Safety timeout — 5 minutes
    setTimeout(() => {
      srv.close();
      reject(new Error("OAuth timeout: no response from browser within 5 minutes"));
    }, 5 * 60_000);
  });
}

/** Open a URL in the system browser (macOS / Windows / Linux). */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "cmd" :
    "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildAuthHeader(auth: StoredAuth): string {
  return auth.type === "oauth"
    ? `Bearer ${auth.token}`
    : `Basic ${Buffer.from(`:${auth.token}`).toString("base64")}`;
}
