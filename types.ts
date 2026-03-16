// ─── Core node shapes ────────────────────────────────────────────────────────

/** Raw node extracted from markdown headers, before tree assembly */
export interface RawNode {
  node_title: string;
  line_num: number;
}

/** Node after text content has been extracted */
export interface FlatNode {
  title: string;
  line_num: number;
  level: number;
  text: string;
  text_token_count?: number;
}

/** Fully assembled tree node (recursive) */
export interface TreeNode {
  title: string;
  node_id: string;
  text: string;
  line_num: number;
  summary?: string;
  prefix_summary?: string;
  nodes: TreeNode[];
}

/** Tree node after optional cleanup (nodes[] may be absent if leaf) */
export interface CleanTreeNode {
  title: string;
  node_id: string;
  text: string;
  line_num: number;
  summary?: string;
  prefix_summary?: string;
  nodes?: CleanTreeNode[];
}

// ─── Top-level output ─────────────────────────────────────────────────────────

export interface MdTreeResult {
  doc_name: string;
  doc_description?: string;
  structure: CleanTreeNode[];
}

// ─── CLI options ──────────────────────────────────────────────────────────────

export interface MdToTreeOptions {
  mdPath: string;
  ifThinning?: boolean;
  minTokenThreshold?: number;
  ifAddNodeSummary?: "yes" | "no";
  summaryTokenThreshold?: number;
  model?: string;
  ifAddDocDescription?: "yes" | "no";
  ifAddNodeText?: "yes" | "no";
  ifAddNodeId?: "yes" | "no";
}
