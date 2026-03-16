/**
 * utils.ts
 *
 * Full TypeScript equivalent of the Python utils module.
 * Covers: token counting, tree traversal helpers, structure formatting,
 * LLM-backed summary / description generation, and pretty-printing.
 */

import OpenAI from "openai";
import { get_encoding, type Tiktoken } from "tiktoken";
import type { CleanTreeNode, TreeNode } from "./types.ts";

// ─── OpenAI client (OpenAI-compatible) ───────────────────────────────────────

let _client: OpenAI | null = null;

export function getClient(): OpenAI {
  if (_client) return _client;

  const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.OPENAI_API_KEY ?? "sk-placeholder";

  _client = new OpenAI({ baseURL, apiKey });
  return _client;
}

// ─── Token counting ───────────────────────────────────────────────────────────

const encoderCache = new Map<string, Tiktoken>();

/**
 * Count tokens in a string.
 * Falls back to a whitespace-split word count if the model encoding is unknown.
 */
export function countTokens(text: string, model?: string): number {
  if (!text) return 0;

  // tiktoken encoding name resolution (best-effort)
  const encodingName = resolveEncoding(model);
  try {
    let enc = encoderCache.get(encodingName);
    if (!enc) {
      enc = get_encoding(encodingName as Parameters<typeof get_encoding>[0]);
      encoderCache.set(encodingName, enc);
    }
    return enc.encode(text).length;
  } catch {
    // Fallback: rough word-count approximation (~0.75 tokens per word)
    return Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75);
  }
}

function resolveEncoding(model?: string): string {
  if (!model) return "cl100k_base";
  const m = model.toLowerCase();
  if (m.includes("gpt-4") || m.includes("gpt-3.5")) return "cl100k_base";
  if (m.includes("davinci") || m.includes("curie")) return "p50k_base";
  return "cl100k_base";
}

// ─── Tree traversal helpers ───────────────────────────────────────────────────

/**
 * Flatten a recursive tree structure into a plain list (depth-first).
 * Mirrors Python's `structure_to_list`.
 */
export function structureToList(
  structure: TreeNode[] | CleanTreeNode[]
): (TreeNode | CleanTreeNode)[] {
  const result: (TreeNode | CleanTreeNode)[] = [];

  function walk(nodes: (TreeNode | CleanTreeNode)[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.nodes && node.nodes.length > 0) {
        walk(node.nodes);
      }
    }
  }

  walk(structure);
  return result;
}

/**
 * Recursively write sequential node IDs (zero-padded to 4 digits).
 * Mirrors Python's `write_node_id`.
 */
export function writeNodeId(
  nodes: TreeNode[],
  counter = { value: 1 }
): void {
  for (const node of nodes) {
    node.node_id = String(counter.value).padStart(4, "0");
    counter.value++;
    if (node.nodes?.length) {
      writeNodeId(node.nodes, counter);
    }
  }
}

// ─── Structure formatting (field ordering / filtering) ────────────────────────

type NodeField = keyof (TreeNode & CleanTreeNode);
const VALID_FIELDS: NodeField[] = [
  "title",
  "node_id",
  "summary",
  "prefix_summary",
  "text",
  "line_num",
  "nodes",
];

/**
 * Return a new structure with only the requested fields, in the given order.
 * Mirrors Python's `format_structure`.
 */
export function formatStructure(
  nodes: (TreeNode | CleanTreeNode)[],
  order: NodeField[] = VALID_FIELDS
): CleanTreeNode[] {
  return nodes.map((node) => {
    const out: Partial<CleanTreeNode> = {};

    const nodeRecord = node as unknown as Record<string, unknown>;
    const outRecord = out as unknown as Record<string, unknown>;

    for (const field of order) {
      if (field === "nodes") {
        if (node.nodes && node.nodes.length > 0) {
          out.nodes = formatStructure(node.nodes, order);
        }
      } else if (field in node && nodeRecord[field] !== undefined) {
        outRecord[field] = nodeRecord[field];
      }
    }

    return out as CleanTreeNode;
  });
}

/**
 * Strip everything except title / node_id / nodes — used when preparing a
 * tree for doc-description generation.
 */
export function createCleanStructureForDescription(
  nodes: (TreeNode | CleanTreeNode)[]
): CleanTreeNode[] {
  return formatStructure(nodes, ["title", "node_id", "nodes"]);
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a concise summary for a single tree node.
 * Mirrors Python's `generate_node_summary`.
 */
export async function generateNodeSummary(
  node: TreeNode | CleanTreeNode,
  model = "gpt-4o-mini"
): Promise<string> {
  const client = getClient();
  const nodeText = node.text ?? "";

  const systemPrompt = `You are a precise technical summariser. 
Given the text content of a document section, produce a concise summary (2-4 sentences) that captures the main ideas. 
Return only the summary text, no preamble.`;

  const userPrompt = `Section title: ${node.title}\n\nContent:\n${nodeText}`;

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? nodeText;
  } catch (err) {
    throw new Error(`Failed to generate summary for node "${node.title}": ${err}`);
  }
}

/**
 * Generate a high-level description for the entire document.
 * Mirrors Python's `generate_doc_description`.
 */
export async function generateDocDescription(
  cleanStructure: CleanTreeNode[],
  model = "gpt-4o-mini"
): Promise<string> {
  const client = getClient();
  const toc = buildTocString(cleanStructure);

  const systemPrompt = `You are a technical document analyst.
Given a table of contents of a document, write a 2-3 sentence description of what the document covers.
Return only the description, no preamble.`;

  const userPrompt = `Table of contents:\n${toc}`;

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    throw new Error(`Failed to generate document description: ${err}`);
  }
}

// ─── Pretty-printing ──────────────────────────────────────────────────────────

/**
 * Print a JSON value in a readable format (mirrors Python's `print_json`).
 */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Build an indented table-of-contents string from a tree structure.
 */
export function buildTocString(
  nodes: (TreeNode | CleanTreeNode)[],
  depth = 0
): string {
  const lines: string[] = [];

  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    const id = node.node_id ? `[${node.node_id}] ` : "";
    lines.push(`${indent}${id}${node.title}`);
    if (node.nodes?.length) {
      lines.push(buildTocString(node.nodes, depth + 1));
    }
  }

  return lines.join("\n");
}

/**
 * Print a table-of-contents to stdout (mirrors Python's `print_toc`).
 */
export function printToc(nodes: (TreeNode | CleanTreeNode)[]): void {
  console.log(buildTocString(nodes));
}
