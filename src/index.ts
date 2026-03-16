#!/usr/bin/env bun
/**
 * index.ts — CLI entry point for md-tree
 *
 * Usage:
 *   bun run src/index.ts --input path/to/file.md [options]
 *
 * Options:
 *   --input,   -i  <path>         Path to the input markdown file (required)
 *   --output,  -o  <path>         Path for the JSON output file (default: results/<name>_structure.json)
 *   --model,   -m  <string>       Model name to use (default: gpt-4o-mini)
 *   --summary, -s                 Generate LLM summaries for each node
 *   --summary-threshold <n>       Token count below which text is used as-is (default: 200)
 *   --thinning                    Enable tree thinning
 *   --thinning-threshold <n>      Minimum token count per node before merging (default: 5000)
 *   --doc-description             Generate a top-level document description
 *   --with-text                   Include raw node text in output
 *   --no-node-id                  Omit node IDs from output
 *   --toc                         Print table of contents to stdout
 *   --help, -h                    Show this help message
 *
 * Environment variables:
 *   OPENAI_API_KEY    Your API key (required for summary/description features)
 *   OPENAI_BASE_URL   Override the base URL (default: https://api.openai.com/v1)
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, basename, extname } from "path";
import { mdToTree } from "./md-tree.ts";
import { printJson, printToc } from "./utils.ts";

// ─── Argument parsing ─────────────────────────────────────────────────────────

interface CliArgs {
  input: string;
  output?: string;
  model: string;
  summary: boolean;
  summaryThreshold: number;
  thinning: boolean;
  thinningThreshold: number;
  docDescription: boolean;
  withText: boolean;
  noNodeId: boolean;
  toc: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    input: "",
    model: "gpt-4o-mini",
    summary: false,
    summaryThreshold: 200,
    thinning: false,
    thinningThreshold: 5000,
    docDescription: false,
    withText: false,
    noNodeId: false,
    toc: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const val = argv[++i];
      if (val === undefined) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      return val;
    };

    switch (arg) {
      case "--input":
      case "-i":
        args.input = next();
        break;
      case "--output":
      case "-o":
        args.output = next();
        break;
      case "--model":
      case "-m":
        args.model = next();
        break;
      case "--summary":
      case "-s":
        args.summary = true;
        break;
      case "--summary-threshold":
        args.summaryThreshold = Number(next());
        break;
      case "--thinning":
        args.thinning = true;
        break;
      case "--thinning-threshold":
        args.thinningThreshold = Number(next());
        break;
      case "--doc-description":
        args.docDescription = true;
        break;
      case "--with-text":
        args.withText = true;
        break;
      case "--no-node-id":
        args.noNodeId = true;
        break;
      case "--toc":
        args.toc = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        // Treat bare positional arg as input if not yet set
        if (!arg.startsWith("-") && !args.input) {
          args.input = arg;
        } else {
          console.warn(`Unknown argument: ${arg}`);
        }
    }
  }

  return args;
}

function printHelp() {
  console.log(`
md-tree — Convert Markdown files into hierarchical JSON tree structures

Usage:
  bun run src/index.ts --input <file.md> [options]

Options:
  --input,   -i  <path>         Markdown file to process (required)
  --output,  -o  <path>         Output JSON path (default: results/<name>_structure.json)
  --model,   -m  <model>        LLM model name (default: gpt-4o-mini)
  --summary, -s                 Generate LLM node summaries
  --summary-threshold <n>       Min tokens before summarising a node (default: 200)
  --thinning                    Merge nodes below the token threshold
  --thinning-threshold <n>      Min tokens per node before merging (default: 5000)
  --doc-description             Generate a document-level description (requires --summary)
  --with-text                   Include raw text in output nodes
  --no-node-id                  Omit node IDs
  --toc                         Print table of contents
  --help, -h                    Show this help

Environment:
  OPENAI_API_KEY    API key for the OpenAI-compatible endpoint
  OPENAI_BASE_URL   Custom base URL (default: https://api.openai.com/v1)

Examples:
  # Basic tree (no LLM)
  bun run src/index.ts -i docs/guide.md --toc

  # Tree with summaries, saved to custom path
  bun run src/index.ts -i docs/guide.md -o out/guide.json --summary

  # Full pipeline with thinning and doc description
  bun run src/index.ts -i docs/guide.md --thinning --summary --doc-description
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help || argv.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error("Error: --input <path> is required.");
    printHelp();
    process.exit(1);
  }

  if (!existsSync(args.input)) {
    console.error(`Error: Input file not found: ${args.input}`);
    process.exit(1);
  }

  // Resolve output path
  const docName = basename(args.input, extname(args.input));
  const outputPath =
    args.output ??
    join(dirname(args.input), "results", `${docName}_structure.json`);

  // Run pipeline
  console.log(`\nProcessing: ${args.input}`);
  console.log("─".repeat(50));

  const result = await mdToTree({
    mdPath: args.input,
    model: args.model,
    ifThinning: args.thinning,
    minTokenThreshold: args.thinningThreshold,
    ifAddNodeSummary: args.summary ? "yes" : "no",
    summaryTokenThreshold: args.summaryThreshold,
    ifAddDocDescription: args.docDescription ? "yes" : "no",
    ifAddNodeText: args.withText ? "yes" : "no",
    ifAddNodeId: args.noNodeId ? "no" : "yes",
  });

  // Print tree structure
  console.log("\n" + "=".repeat(60));
  console.log("TREE STRUCTURE");
  console.log("=".repeat(60));
  printJson(result);

  // Optionally print table of contents
  if (args.toc) {
    console.log("\n" + "=".repeat(60));
    console.log("TABLE OF CONTENTS");
    console.log("=".repeat(60));
    printToc(result.structure);
  }

  // Save output
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`\nTree structure saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
