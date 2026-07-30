# Graphify CLI Command Map

**Verified against graphify 0.9.29**, read from the `cli.py` dispatch table — not from
`graphify --help`, which is **incomplete** (it omits `export html`, `export wiki`,
`export obsidian`, `export svg`, `export graphml`, `export neo4j`, `export falkordb`).

Two more traps:

- `graphify <command> --help` **does not work** — it falls through to root help.
- To re-verify after an upgrade:
  ```bash
  python -c "import graphify,os;print(os.path.dirname(graphify.__file__))"
  # grep that dir's cli.py for:  ^\s+(if|elif) cmd ==
  ```

**State directory:** `graphify-out/` (not `.graphify/`). Set by the `GRAPHIFY_OUT` env var,
default `"graphify-out"` — see `graphify/paths.py:26`. Every `--graph <path>` flag defaults to
`<cwd>/graphify-out/graph.json`. There is **no `graphify migrate-state`**.

> There is **no `graphify build`**. First build is `graphify extract`; refresh is
> `graphify update`.

---

## Commands that do NOT exist in 0.9.29

Do not emit these — they are in older/newer docs, not this CLI:

`build` · `scope` · `summary` · `describe` · `analyze` · `serve` · `state` · `migrate-state` ·
`portable-check` · `affected-flows` · `review-context` · `detect-changes` · `flows` ·
`agent-stats` · `pr` · top-level `wiki` · `export spanner` · `update --fill-missing`

The MCP server is the **separate `graphify-mcp` binary** (installed alongside `graphify`), not
a `graphify serve` subcommand.

---

## 1. Build and refresh

| Command | Job |
| --- | --- |
| `graphify extract <path>` | Full extraction (AST + optional semantic LLM). **This is the first build.** |
| `graphify update <path>` | Re-extract changed code files and update an existing graph. No LLM needed. |
| `graphify cluster-only <path>` | Rerun clustering on an existing `graph.json` and regenerate `GRAPH_REPORT.md`. |
| `graphify label <path>` | (Re)name communities with an LLM backend, regenerate report. |
| `graphify check-update <path>` | Report whether a semantic re-extraction is pending. Cheap; cron-safe. |
| `graphify watch <path>` | Watch a folder and rebuild on code changes. |
| `graphify merge-graphs <g1> <g2> …` | Merge two or more `graph.json` files into one cross-repo graph (`--out`, `--branch`). |

### `graphify extract` flags

- **`--out DIR` / `--output DIR` — defaults to `<path>`, NOT cwd.** `graphify extract src`
  writes `src/graphify-out/`, where no query command looks. **Always pass `--out .`.**
- `--code-only` — index code via local AST only, **no API key required**. The no-backend path.
- `--backend gemini|kimi|claude|openai|deepseek|ollama|bedrock|azure|claude-cli`
- `--model M`, `--mode deep` (aggressive INFERRED-edge semantic extraction)
- `--force` — full re-scan, skip the incremental manifest gate and semantic cache
- `--max-workers N` (default: cpu_count), `--max-concurrency N` (default 4; use 1 for local LLMs)
- `--token-budget N` (per-chunk cap, default 60000), `--api-timeout S` (default 600)
- `--no-gitignore` — ignore `.gitignore`, prioritize `.graphifyignore`
- `--no-cluster` — write raw extraction only
- `--postgres DSN` — extract schema from a live PostgreSQL DB (tables/views/functions + FKs;
  no column-level detail)
- `--cargo`, `--google-workspace`, `--global`, `--as <tag>`

### `graphify update` flags

`--force` (also `GRAPHIFY_FORCE=1`; use after refactors that delete code) · `--no-cluster`

### `graphify cluster-only` / `graphify label` flags

- `--no-viz` — skip `graph.html` (needed above 5000 nodes)
- `--no-label` — keep `Community N` placeholders, skip LLM naming (`cluster-only` only)
- `--missing-only` — keep existing labels, name only placeholders (`label` only)
- `--graph <path>` · `--backend=<name>` · `--model=<name>`
- `--max-concurrency=N` (default 4; forced to 1 for `ollama` and `claude-cli`)
- `--batch-size=N` (communities per LLM call, default 100)

### Labeling with no API key

`--backend claude-cli` shells out to the locally-installed `claude` binary and bills the
user's **Claude Code subscription**, not API credit. Env knobs:
`GRAPHIFY_CLAUDE_CLI_MODEL` (e.g. `haiku`), `GRAPHIFY_CLAUDE_CLI_PARALLEL=1` (defaults serial).
**It spends the user's plan quota — confirm before running.**

### Verified no-backend behavior

`graphify extract <path> --code-only --out .` completes and writes `graph.json` +
`.graphify_analysis.json`, then instructs you to run `cluster-only` to get `GRAPH_REPORT.md`.
All communities stay `Community N`. Report that honestly.

## 2. Query and navigate

| Command | Job |
| --- | --- |
| `graphify god-nodes` | Most-connected nodes — the architectural hubs. **Best first read after the report.** |
| `graphify explain "<node>"` | One node, its neighbours, grouped by file. **Sharpest tool on a big graph.** |
| `graphify path "<A>" "<B>"` | Shortest path between two nodes. |
| `graphify affected "<X>"` | Reverse traversal — what is impacted by X. |
| `graphify query "<question>"` | BFS (or `--dfs`) traversal for a question. Saturates on large graphs. |
| `graphify benchmark [graph.json]` | Measure token reduction vs a naive full-corpus read. |
| `graphify diagnose multigraph` | Report same-endpoint edge-collapse risk. |

Flags worth knowing:

- `graphify god-nodes --top <n>` (default 10) · `--json`
- `graphify query --budget <n>` caps output at N tokens (default 2000) — use it instead of
  pasting `graph.json` into a prompt; `--context C` filters by edge context (repeatable)
- `graphify affected --relation R` (repeatable) `--depth N` (default 2)
- `graphify diagnose multigraph --json --max-examples N --directed|--undirected --extract-path`
- all of them accept `--graph <path>`

**Note on `query`:** it is a breadth-first walk, not a ranked search. On a 6000-node graph a
simple question returns hundreds of nodes and truncates at the budget. Prefer `explain` for a
known symbol and `affected` for impact.

## 3. Export

`graphify export <format>` turns an existing graph into an artifact. Valid formats:

`html` · `callflow-html` · `obsidian` · `wiki` · `svg` · `graphml` · `neo4j` · `falkordb`

- `export html [--graph PATH] [--labels PATH] [--node-limit N] [--no-viz]` — force-directed
  graph. **Skipped above `--node-limit` (default 5000)**; the file is heavy (~7 MB at 6000 nodes).
- `export callflow-html [GRAPH|DIR] [--report PATH] [--sections PATH] [--output HTML]
  [--lang auto|zh-CN|en] [--max-sections N] [--diagram-scale N]` — Mermaid call-flow HTML.
- `export obsidian [--dir PATH]` · `export wiki` · `export svg` · `export graphml`
- `export neo4j|falkordb [--push URI] [--user U] [--password P]` — prefer `NEO4J_PASSWORD` /
  `FALKORDB_PASSWORD` env vars so the password never lands on argv.

**Better than `export html` for large graphs:** `graphify tree`.

## 4. Tree view (the light human artifact)

```bash
graphify tree --root src --label MyRepo    # -> graphify-out/GRAPH_TREE.html
```

D3 v7 collapsible hierarchy. **No node cap** and ~20x smaller than `graph.html`.
Flags: `--graph PATH` · `--output HTML` · `--root PATH` (filesystem root for the hierarchy) ·
`--max-children N` (default 200) · `--top-k-edges N` (default 12) · `--label NAME`.

## 5. Keep it fresh automatically

| Command | Job |
| --- | --- |
| `graphify watch <path>` | Foreground auto-rebuild loop. |
| `graphify hook install` | Install `post-commit` / `post-checkout` git hooks (also sets up the merge driver). |
| `graphify hook status` / `graphify hook uninstall` | Check / remove those hooks. |
| `graphify merge-driver <base> <current> <other>` | Git merge driver: union-merge two `graph.json` files. Wired up by `hook install`. |

## 6. Memory and feedback loop

| Command | Job |
| --- | --- |
| `graphify save-result` | Save a Q&A result to `graphify-out/memory/` (`--question`, `--answer`, `--type query\|path_query\|explain`, `--nodes`, `--outcome useful\|dead_end\|corrected`, `--correction`, `--memory-dir`). |
| `graphify reflect` | Aggregate memory outcomes into `graphify-out/reflections/LESSONS.md` (`--half-life-days`, `--min-corroboration`, `--graph`, `--analysis`, `--labels`, `--out`). |

## 7. Ingest external material

| Command | Job |
| --- | --- |
| `graphify add <url>` | Fetch a URL into `./raw` (`--dir`, `--author`, `--contributor`), then update the graph. |
| `graphify clone <github-url>` | Clone a repo locally and print its path (`--branch`, `--out`). |
| `graphify prs [selector]` | Inspect local GitHub pull requests via `gh` and git worktree data. |

## 8. Cross-repo global graph

| Command | Job |
| --- | --- |
| `graphify global add <graph.json>` | Add/update a project graph in `~/.graphify/global-graph.json` (`--as <tag>`). |
| `graphify global remove <tag>` / `global list` / `global path` | Manage the global graph. |

## 9. Install / uninstall

`graphify install --platform <id>` accepts: `claude`, `windows`, `codebuddy`, `codex`,
`opencode`, `aider`, `amp`, `agents`, `claw`, `droid`, `trae`, `trae-cn`, `gemini`, `cursor`,
`antigravity`, `hermes`, `kiro`, `pi`, `devin`. `skills` is an alias for `agents`.

Per-platform subcommands also exist: `graphify claude install`, `graphify gemini install`,
`graphify cursor install`, `graphify opencode install`, `graphify kilo install`,
`graphify copilot install`, `graphify vscode install`, etc. (each with a matching `uninstall`).

`graphify uninstall` removes graphify from **all** detected platforms at once;
`--purge` also deletes `graphify-out/`.

**`agents` writes the shared root** — `~/.agents/skills/graphify/SKILL.md` globally, or
`./.agents/skills/…` with `--project`. Any Agent-Skills-compliant framework reads it, so no
`npx skills add` step is required.

## Minimal CLI session (no API key)

```bash
pip install graphifyy                       # CLI: graphify   MCP server: graphify-mcp
graphify extract src --code-only --out .    # -> graphify-out/graph.json
graphify cluster-only . --no-label          # -> graphify-out/GRAPH_REPORT.md
graphify god-nodes --top 15                 # sanity-check: do the hubs look right?
graphify explain "requirePermission()"
graphify path "<A>" "<B>"
graphify tree --root src --label MyRepo     # -> graphify-out/GRAPH_TREE.html
graphify update .                           # refresh later, no API cost
```

## Environment variables

`GRAPHIFY_OUT` (state dir, default `graphify-out`) · `GRAPHIFY_FORCE` · `GRAPHIFY_MAX_WORKERS` ·
`GRAPHIFY_VIZ_NODE_LIMIT` · `GRAPHIFY_CLAUDE_CLI_MODEL` · `GRAPHIFY_CLAUDE_CLI_PARALLEL` ·
`GRAPHIFY_OLLAMA_PARALLEL` · `GRAPHIFY_API_TIMEOUT` · `GRAPHIFY_MAX_RETRIES` ·
`GRAPHIFY_NO_INCREMENTAL_CACHE` · `GRAPHIFY_NO_TIPS` · `GRAPHIFY_DEBUG` · `GRAPHIFY_REPO_ROOT`

**There is no symbol-filter env var.** A noisy repeated identifier (e.g. Next.js
`export const metadata` in every App Router page) cannot be excluded — `.graphifyignore`
filters paths, not symbols. Report it as a limitation; do not hand-edit `graph.json`, since
the next `graphify update` regenerates it.
