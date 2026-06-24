#!/usr/bin/env node
// ─── Azure DevOps MCP ─────────────────────────────────────────────────────────
//
//  CLI usage:
//    npx azure-board-mcp authenticate          ← PAT setup wizard
//    npx azure-board-mcp authenticate --oauth  ← OAuth device code (needs AZURE_CLIENT_ID)
//    npx azure-board-mcp check                 ← validate stored credentials
//    npx azure-board-mcp logout                ← clear stored credentials
//    npx azure-board-mcp                       ← start MCP server (stdio)
//

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAuth, cmdAuthenticate, cmdCheck, cmdLogout } from "./auth.ts";
import { AzureDevOpsClient } from "./client.ts";
import { TOOLS, handleTool } from "./tools.ts";

const [cmd] = process.argv.slice(2);

// ── CLI commands ──────────────────────────────────────────────────────────────

if (cmd === "authenticate" || cmd === "auth") {
  const readOnly = process.argv.includes("--read-only");
  const oauth = process.argv.includes("--oauth");
  await cmdAuthenticate({ readOnly, oauth });
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

// ── MCP server ────────────────────────────────────────────────────────────────

const auth = await loadAuth();
if (!auth) {
  console.error(
    [
      "Not authenticated.",
      "",
      "Run one of:",
      "  npx azure-board-mcp authenticate          (PAT — no app registration needed)",
      "  npx azure-board-mcp authenticate --oauth  (OAuth device code, needs AZURE_CLIENT_ID)",
      "",
      "Or set env vars:  AZURE_ORG  AZURE_PROJECT  AZURE_PAT",
    ].join("\n"),
  );
  process.exit(1);
}

const client = new AzureDevOpsClient(auth);

const server = new Server(
  { name: "azure-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  return handleTool(client, name, args as Record<string, unknown>);
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`Azure MCP ready  (${auth.org} / ${auth.project})`);
