#!/usr/bin/env tsx
import { runCli } from "./cli.js";

const code = await runCli(process.argv.slice(2), process.env);
process.exit(code);
