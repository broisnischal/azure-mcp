#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "..", "src", "index.ts");
const r = spawnSync("bun", [entry], { stdio: "inherit" });
process.exit(r.status ?? 1);
