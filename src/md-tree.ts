import { readFileSync } from "fs";
import { basename, extname } from "path";
import type {
  CleanTreeNode,
  FlatNode,
  MdToTreeOptions,
  MdTreeResult,
  RawNode,
  TreeNode,
} from "./types.ts";
import {
  countTokens,
  createCleanStructureForDescription,
  formatStructure,
  generateDocDescription,
  generateNodeSummary,
  structureToList,
  writeNodeId,
} from "./utils.ts";

// ─── Step 1 : extract header positions from raw markdown ─────────────────────

export function extractNodesFromMarkdown(markdownContent: string): {
  nodeList: RawNode[];
  lines: string[];
} {
  const headerPattern = /^(#{1,6})\s+(.+)$/;
  const codeBlockPattern = /^```/;

  const lines = markdownContent.split("\n");
  const nodeList: RawNode[] = [];
  let inCodeBlock = false;

  lines.forEach((line, idx) => {
    const stripped = line.trim();

    if (codeBlockPattern.test(stripped)) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (!stripped || inCodeBlock) return;

    const match = stripped.match(headerPattern);
    if (match) {
      nodeList.push({ node_title: match[2].trim(), line_num: idx + 1 });
    }
  });

  return { nodeList, lines };
}

// ─── Step 2 : attach text content to each node ───────────────────────────────

export function extractNodeTextContent(
  nodeList: RawNode[],
  markdownLines: string[],
): FlatNode[] {
  const allNodes: FlatNode[] = [];

  for (const node of nodeList) {
    const lineContent = markdownLines[node.line_num - 1];
    const headerMatch = lineContent?.match(/^(#{1,6})/);

    if (!headerMatch) {
      console.warn(
        `Warning: Line ${node.line_num} does not contain a valid header: '${lineContent}'`,
      );
      continue;
    }

    allNodes.push({
      title: node.node_title,
      line_num: node.line_num,
      level: headerMatch[1].length,
      text: "",
    });
  }

  // Attach text spans
  allNodes.forEach((node, i) => {
    const startLine = node.line_num - 1;
    const endLine =
      i + 1 < allNodes.length
        ? allNodes[i + 1].line_num - 1
        : markdownLines.length;
    node.text = markdownLines.slice(startLine, endLine).join("\n").trim();
  });

  return allNodes;
}

// ─── Step 3 : compute combined token counts (parent + all descendants) ────────

export function updateNodeListWithTextTokenCount(
  nodeList: FlatNode[],
  model?: string,
): FlatNode[] {
  function findAllChildren(parentIndex: number, parentLevel: number): number[] {
    const indices: number[] = [];
    for (let i = parentIndex + 1; i < nodeList.length; i++) {
      if (nodeList[i].level <= parentLevel) break;
      indices.push(i);
    }
    return indices;
  }

  const result = nodeList.map((n) => ({ ...n }));

  // Process back-to-front so children are counted before parents
  for (let i = result.length - 1; i >= 0; i--) {
    const children = findAllChildren(i, result[i].level);
    let combined = result[i].text ?? "";
    for (const ci of children) {
      const ct = result[ci].text;
      if (ct) combined += "\n" + ct;
    }
    result[i].text_token_count = countTokens(combined, model);
  }

  return result;
}

// ─── Step 4 : optional tree thinning ─────────────────────────────────────────

export function treeThinningForIndex(
  nodeList: FlatNode[],
  minNodeToken: number,
  model?: string,
): FlatNode[] {
  function findAllChildren(parentIndex: number, parentLevel: number): number[] {
    const indices: number[] = [];
    for (let i = parentIndex + 1; i < nodeList.length; i++) {
      if (nodeList[i].level <= parentLevel) break;
      indices.push(i);
    }
    return indices;
  }

  const result = nodeList.map((n) => ({ ...n }));
  const toRemove = new Set<number>();

  for (let i = result.length - 1; i >= 0; i--) {
    if (toRemove.has(i)) continue;

    const totalTokens = result[i].text_token_count ?? 0;
    if (totalTokens >= minNodeToken) continue;

    const children = findAllChildren(i, result[i].level);
    const childTexts: string[] = [];

    for (const ci of children.sort((a, b) => a - b)) {
      if (!toRemove.has(ci)) {
        const ct = result[ci].text?.trim();
        if (ct) childTexts.push(ct);
        toRemove.add(ci);
      }
    }

    if (childTexts.length > 0) {
      let merged = result[i].text ?? "";
      for (const ct of childTexts) {
        if (merged && !merged.endsWith("\n")) merged += "\n\n";
        merged += ct;
      }
      result[i].text = merged;
      result[i].text_token_count = countTokens(merged, model);
    }
  }

  // Remove marked indices (highest first to preserve ordering)
  for (const idx of [...toRemove].sort((a, b) => b - a)) {
    result.splice(idx, 1);
  }

  return result;
}

// ─── Step 5 : assemble tree from flat list ────────────────────────────────────

export function buildTreeFromNodes(nodeList: FlatNode[]): TreeNode[] {
  const stack: [TreeNode, number][] = [];
  const roots: TreeNode[] = [];
  let counter = 1;

  for (const node of nodeList) {
    const treeNode: TreeNode = {
      title: node.title,
      node_id: String(counter++).padStart(4, "0"),
      text: node.text,
      line_num: node.line_num,
      nodes: [],
    };

    // Pop stack until we find a valid parent
    while (stack.length > 0 && stack[stack.length - 1][1] >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(treeNode);
    } else {
      stack[stack.length - 1][0].nodes.push(treeNode);
    }

    stack.push([treeNode, node.level]);
  }

  return roots;
}

// ─── Step 6 : strip internal fields for output ───────────────────────────────

export function cleanTreeForOutput(treeNodes: TreeNode[]): CleanTreeNode[] {
  return treeNodes.map((node) => {
    const cleaned: CleanTreeNode = {
      title: node.title,
      node_id: node.node_id,
      text: node.text,
      line_num: node.line_num,
    };
    if (node.nodes.length > 0) {
      cleaned.nodes = cleanTreeForOutput(node.nodes);
    }
    return cleaned;
  });
}

// ─── Step 7 : LLM summary generation ─────────────────────────────────────────

async function getNodeSummary(
  node: TreeNode | CleanTreeNode,
  summaryTokenThreshold: number,
  model?: string,
): Promise<string> {
  const nodeText = node.text ?? "";
  const numTokens = countTokens(nodeText, model);
  if (numTokens < summaryTokenThreshold) return nodeText;
  return generateNodeSummary(node, model);
}

export async function generateSummariesForStructure(
  structure: (TreeNode | CleanTreeNode)[],
  summaryTokenThreshold: number,
  model?: string,
): Promise<(TreeNode | CleanTreeNode)[]> {
  const nodes = structureToList(structure) as (TreeNode | CleanTreeNode)[];

  const summaries = await Promise.all(
    nodes.map((n) => getNodeSummary(n, summaryTokenThreshold, model)),
  );

  nodes.forEach((node, i) => {
    if (!node.nodes || node.nodes.length === 0) {
      node.summary = summaries[i];
    } else {
      node.prefix_summary = summaries[i];
    }
  });

  return structure;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function mdToTree(opts: MdToTreeOptions): Promise<MdTreeResult> {
  const {
    mdPath,
    ifThinning = false,
    minTokenThreshold,
    ifAddNodeSummary = "no",
    summaryTokenThreshold = 200,
    model,
    ifAddDocDescription = "no",
    ifAddNodeText = "no",
    ifAddNodeId = "yes",
  } = opts;

  const markdownContent = readFileSync(mdPath, "utf-8");

  console.log("Extracting nodes from markdown...");
  const { nodeList, lines } = extractNodesFromMarkdown(markdownContent);

  console.log("Extracting text content from nodes...");
  let nodesWithContent = extractNodeTextContent(nodeList, lines);

  if (ifThinning && minTokenThreshold != null) {
    nodesWithContent = updateNodeListWithTextTokenCount(
      nodesWithContent,
      model,
    );
    console.log("Thinning nodes...");
    nodesWithContent = treeThinningForIndex(
      nodesWithContent,
      minTokenThreshold,
      model,
    );
  }

  console.log("Building tree from nodes...");
  let treeStructure: (TreeNode | CleanTreeNode)[] =
    buildTreeFromNodes(nodesWithContent);

  if (ifAddNodeId === "yes") {
    writeNodeId(treeStructure as TreeNode[]);
  }

  console.log("Formatting tree structure...");

  if (ifAddNodeSummary === "yes") {
    treeStructure = formatStructure(treeStructure, [
      "title",
      "node_id",
      "summary",
      "prefix_summary",
      "text",
      "line_num",
      "nodes",
    ]);

    console.log("Generating summaries for each node...");
    treeStructure = await generateSummariesForStructure(
      treeStructure,
      summaryTokenThreshold,
      model,
    );

    if (ifAddNodeText === "no") {
      treeStructure = formatStructure(treeStructure, [
        "title",
        "node_id",
        "summary",
        "prefix_summary",
        "line_num",
        "nodes",
      ]);
    }

    if (ifAddDocDescription === "yes") {
      console.log("Generating document description...");
      const cleanStructure = createCleanStructureForDescription(treeStructure);
      const docDescription = await generateDocDescription(
        cleanStructure,
        model,
      );
      return {
        doc_name: basename(mdPath, extname(mdPath)),
        doc_description: docDescription,
        structure: treeStructure as CleanTreeNode[],
      };
    }
  } else {
    treeStructure = formatStructure(
      treeStructure,
      ifAddNodeText === "yes"
        ? [
            "title",
            "node_id",
            "summary",
            "prefix_summary",
            "text",
            "line_num",
            "nodes",
          ]
        : [
            "title",
            "node_id",
            "summary",
            "prefix_summary",
            "line_num",
            "nodes",
          ],
    );
  }

  return {
    doc_name: basename(mdPath, extname(mdPath)),
    structure: treeStructure as CleanTreeNode[],
  };
}
