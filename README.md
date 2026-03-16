# md-tree

Convert Markdown files into hierarchical JSON tree structures with optional LLM summaries.

## Overview

`md-tree` parses Markdown documents and creates structured JSON representations with:
- Hierarchical tree structure based on headers
- Optional AI-powered summaries for each section
- Document-level descriptions
- Token counting and tree thinning for large documents

Perfect for document indexing, knowledge base structuring, semantic chunking for RAG, and markdown-to-JSON conversion.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mdtree

# Install dependencies
bun install
```

## Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
# Required for LLM features (--summary, --doc-description)
OPENAI_API_KEY=your-api-key-here

# Optional: Custom OpenAI-compatible endpoint
OPENAI_BASE_URL=https://api.openai.com/v1
```

### LLM Providers

The tool works with any OpenAI-compatible API:

| Provider | OPENAI_BASE_URL | Notes |
|----------|----------------|-------|
| OpenAI | `https://api.openai.com/v1` | Official API |
| Groq | `https://api.groq.com/openai/v1` | Fast inference |
| Together | `https://api.together.xyz/v1` | Open models |
| Ollama | `http://localhost:11434/v1` | Local LLMs |
| LM Studio | `http://localhost:1234/v1` | Local GUI |

**For local providers without API key:** Set `OPENAI_API_KEY` to any value (e.g., `lm-studio`).

## Usage

### Basic Syntax

```bash
bun run src/index.ts --input <file.md> [options]
```

### Quick Start

```bash
# Generate tree structure only (no LLM)
bun run src/index.ts -i docs/guide.md

# Generate tree with TOC
bun run src/index.ts -i docs/guide.md --toc

# Generate tree with LLM summaries
bun run src/index.ts -i docs/guide.md --summary

# Full pipeline with all features
bun run src/index.ts -i docs/guide.md --summary --doc-description --thinning
```

## Command Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--input` | `-i` | Path to input Markdown file (required) | - |
| `--output` | `-o` | Output JSON path | `results/<name>_structure.json` |
| `--model` | `-m` | LLM model name | `gpt-4o-mini` |
| `--summary` | `-s` | Generate LLM node summaries | `false` |
| `--summary-threshold` | - | Min tokens before summarizing | `200` |
| `--thinning` | - | Merge nodes below token threshold | `false` |
| `--thinning-threshold` | - | Min tokens per node before merging | `5000` |
| `--doc-description` | - | Generate document-level description | `false` |
| `--with-text` | - | Include raw node text in output | `false` |
| `--no-node-id` | - | Omit node IDs from output | `false` |
| `--toc` | - | Print table of contents to stdout | `false` |
| `--help` | `-h` | Show help message | - |

## Examples

### Example 1: Basic Tree Structure

```bash
bun run src/index.ts -i documentation.md --toc
```

**Output:**
```
TABLE OF CONTENTS
============================================================
[0001] Documentation
  [0002] Getting Started
    [0003] Installation
    [0004] Quick Start
  [0005] API Reference
```

### Example 2: Tree with LLM Summaries

```bash
bun run src/index.ts -i research-paper.md --summary --output results/paper.json
```

**Output structure:**
```json
{
  "doc_name": "research-paper",
  "structure": [
    {
      "title": "Introduction",
      "node_id": "0001",
      "summary": "This section introduces the research problem...",
      "line_num": 1
    }
  ]
}
```

### Example 3: Full Pipeline with All Features

```bash
bun run src/index.ts -i large-document.md \
  --summary \
  --doc-description \
  --thinning \
  --thinning-threshold 8000 \
  --with-text \
  --output results/full.json
```

### Example 4: Force LLM Summaries for All Nodes

```bash
# Set threshold to 0 to generate summaries for every node
bun run src/index.ts -i short-docs.md --summary --summary-threshold 0
```

### Example 5: Using Local LLM (LM Studio)

```bash
# .env file:
OPENAI_API_KEY=lm-studio
OPENAI_BASE_URL=http://localhost:1234/v1

# Run with local model
bun run src/index.ts -i notes.md --summary --model "local-model"
```

## Output Format

### JSON Structure

```json
{
  "doc_name": "document-name",
  "doc_description": "Optional AI-generated document summary...",
  "structure": [
    {
      "title": "Section Title",
      "node_id": "0001",
      "summary": "AI-generated summary of this section",
      "prefix_summary": "Summary for parent nodes",
      "line_num": 5,
      "nodes": [
        {
          "title": "Subsection",
          "node_id": "0002",
          "summary": "Summary of subsection",
          "line_num": 10
        }
      ]
    }
  ]
}
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `doc_name` | Document filename (without extension) |
| `doc_description` | AI-generated high-level document summary |
| `title` | Section title from Markdown header |
| `node_id` | Sequential zero-padded ID (`0001`, `0002`, ...) |
| `summary` | AI-generated summary (leaf nodes) |
| `prefix_summary` | AI-generated summary (parent nodes) |
| `line_num` | Line number in original file |
| `nodes` | Array of child sections (if any) |
| `text` | Raw section text (with `--with-text`) |

## Key Features

### Token-Aware Summarization

- Nodes below `--summary-threshold` (default: 200) use original text
- Nodes above threshold get AI-generated summaries
- Prevents unnecessary API calls on short content

### Tree Thinning

Large documents can produce deeply nested trees. Thinning merges nodes below the threshold:

```bash
# Merge sections with fewer than 5000 tokens
bun run src/index.ts -i huge-doc.md --thinning --thinning-threshold 5000
```

### Summary Threshold Behavior

The threshold works as follows:
- `< threshold`: Use original text (no API call)
- `≥ threshold`: Generate AI summary

This optimizes API usage - short content doesn't need summarization.

## Troubleshooting

### LLM Not Working

**Symptom:** Original text instead of summaries

**Solutions:**
1. Check `.env` configuration
2. Verify `OPENAI_API_KEY` is set
3. Ensure `OPENAI_BASE_URL` includes protocol (`http://` or `https://`)
4. Test API connectivity
5. Check if sections are below `--summary-threshold`

### Connection Errors

```
Error: Failed to generate summary for node "Title": Connection refused
```

**Solutions:**
- Verify `OPENAI_BASE_URL` is correct
- Check local LLM server is running
- Confirm port is correct (LM Studio: `1234`, Ollama: `11434`)

### Silent Failures

The tool now throws clear errors for LLM failures. If you see silent failures, ensure you're using the latest version with proper error handling.

### Empty Summaries

If summaries are empty:
- Verify API key has access to the specified model
- Check model name is correct
- Ensure the model supports chat completions

## Advanced Usage

### Processing Multiple Documents

```bash
#!/bin/bash
for file in docs/*.md; do
  bun run src/index.ts -i "$file" --summary --doc-description
done
```

### Pipeline Integration

```bash
# Parse markdown and pipe to other tools
bun run src/index.ts -i doc.md --output - | jq '.structure[0].title'
```

### Custom Model Configuration

```bash
# Use a specific model
bun run src/index.ts -i doc.md --summary --model "gpt-4o"

# Use a local model with LM Studio
bun run src/index.ts -i doc.md --summary --model "meta-llama/Llama-3.1-8B-Instruct"
```

## Use Cases

1. **Document Indexing**: Create structured indexes of large documentation
2. **Knowledge Base**: Organize markdown notes into searchable structures
3. **RAG Preparation**: Prepare documents for retrieval-augmented generation
4. **Content Analysis**: Analyze document structure with AI summaries
5. **Migration**: Convert markdown to structured JSON for other systems
