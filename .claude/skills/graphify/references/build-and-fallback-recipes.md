# Build and Fallback Recipes

Use these recipes after choosing the mode. Keep the front door in `SKILL.md` small; keep the mechanical detail here.

## Core runtime facts
- Official PyPI package name: `graphifyy`
- CLI command: `graphify`
- Python requirement: 3.10+
- Assistant-native installs exist for Claude, Codex, Gemini, OpenCode, Cursor, Copilot, Aider, and related tools
- Local automation may still need a Python/API or structural-fallback path even when assistant installs exist upstream

## `assistant-native-install`
Use when the user wants Graphify to be available inside the assistant rather than as a one-off local build.

Typical commands:
```bash
graphify install
graphify claude install
graphify codex install
graphify gemini install
graphify opencode install
```

Checklist:
1. verify `graphify --help`
2. confirm the target assistant/runtime exists
3. install only the assistant integration actually needed
4. tell the user how to invoke `/graphify` or the equivalent next step

## `local-python-build`
Use when the environment needs a truthful non-native path.

Typical runtime prep:
```bash
python3 -m pip install graphifyy
graphify --help
```

Guidance:
- prefer the smallest useful subtree first
- first build is `graphify extract <path> --code-only --out .` (no API key); it writes `graphify-out/graph.json` but **not** the report. `graphify cluster-only . --no-label` produces `graphify-out/GRAPH_REPORT.md`. Subsequent refreshes are `graphify update .`
- **always pass `--out .` to `extract`** — the default is `<path>`, so `extract src` buries the graph in `src/graphify-out/` where no query command looks
- `graph.html` comes only from `graphify export html`, and is skipped above `--node-limit` (default 5000). `graphify tree --root src` has no cap and is ~20x lighter
- state lives in `graphify-out/` (env `GRAPHIFY_OUT`), **not** `.graphify/`. There is no `graphify migrate-state`
- if the raw CLI/build surface does not honestly support the needed workflow in the current environment, switch to the tested local/Python path instead of faking parity with assistant-native UX

## `incremental-refresh`
Use when artifacts already exist and the user changed only part of the corpus.

Guidance:
- inspect current `graphify-out/` (run `graphify check-update` first; it reports pending refresh signals cheaply)
- refresh only the changed scope when practical
- preserve or regenerate the same artifact set
- tell the user whether the run was a full rebuild or a refresh of existing outputs

## `graph-query-followup`
Use when the graph exists and the job is now question answering.

Read in this order:
1. `graphify-out/GRAPH_REPORT.md` — God Nodes, Surprising Connections, Import Cycles, Knowledge Gaps
2. `graphify god-nodes --top 15` + `graphify explain "<node>"`
3. `GRAPH_TREE.html` / `graph.html` (for humans)
4. `graph.json` last

Typical follow-up commands:
```bash
graphify explain "BillingPipeline"          # sharpest: one node + neighbours, grouped by file
graphify path "AuthModule" "Database"
graphify affected "AuthModule" --depth 2    # what breaks if this changes
graphify query "show the auth flow" --budget 1500   # BFS; saturates on big graphs
```

Rules:
- prefer one focused query over an unnecessary rebuild
- `query` is a breadth-first walk, not ranked search — on a 6000-node graph it returns hundreds of nodes and truncates. Reach for `explain` / `affected` when you know the symbol
- sanity-check before trusting the graph: the top god-nodes should be abstractions you recognize

## `structural-fallback`
Use when native extraction is unavailable, returns a 0-node graph, or would be misleading for a markdown-heavy corpus.

Good fallback signals:
- filesystem structure
- frontmatter metadata
- support-folder presence (`references/`, `evals/`, `scripts/`, compact variants)
- explicit cross-file mentions or index references
- repo discovery docs that already list the relevant nodes

Fallback output rule:
- still write the normal durable artifact names when possible
- label the result as a **graphify-style structural fallback**, not a native semantic graph build
- explain why the fallback was chosen
## `wikilink-normalization-patch`
Use when a generated wiki/vault is full of broken `[[…]]` links after a graphify wiki build, or after `pip install --upgrade graphifyy`.

**Root cause:** graphify saves community / god-node pages under a *slugged* filename via `_safe_filename(label)` (spaces → `_`, `/` → `-`, `:` → `-`, e.g. `Community 36` → `Community_36.md`) but its wiki generator emits wikilinks with the *raw* label (`[[Community 36]]`). Raw-label links never resolve to the slugged file, so every spaced/special label becomes a broken link across the whole vault. This is a **generator-side** bug, not a vault-lint problem — regex-fixing the already-generated files does not survive the next rebuild.

**Durable local fix** — ship and run the idempotent patcher (`scripts/patch_wikilink.py`). It rewrites every raw-label wikilink site to `[[slug|label]]` via a `_wikilink` helper and is a no-op once applied:

```bash
# verify the transform logic without touching anything
python3 scripts/patch_wikilink.py --self-test
# report whether the installed wiki.py is patched
python3 scripts/patch_wikilink.py --check
# apply (auto-locates graphify, writes a .bak)
python3 scripts/patch_wikilink.py
# or target an explicit install
python3 scripts/patch_wikilink.py --path "$(python3 -c 'import graphify,os;print(os.path.dirname(graphify.__file__))')/wiki.py"
```

**Apply it to config so it self-heals.** Because the fix is an in-place `site-packages/graphify/wiki.py` edit, `pip install --upgrade graphifyy` wipes it. Make the patch durable by wiring it into the same place that runs graphify:
- jeo: add to the `post-implementation` hook in `~/.jeo/config.json` ahead of `graphify update .` — e.g. `python3 <skill>/scripts/patch_wikilink.py --check >/dev/null 2>&1 || python3 <skill>/scripts/patch_wikilink.py`.
- any runtime: run the patcher in the install/upgrade step right after `pip install graphifyy`.

The permanent fix is an upstream PR to [safishamsi/graphify](https://github.com/safishamsi/graphify); the patcher is the durable bridge until it lands.

## Common failure patterns
- **Package/command confusion**: `graphifyy` is the package, `graphify` is the CLI
- **Large noisy repo**: shrink the scope or add ignores before retrying
- **Markdown-heavy corpus**: choose structural fallback sooner
- **Machine-specific artifact leakage**: tell the user if output paths or caches are local-machine specific
- **Noise-dominated community partition**: a high isolated-node count in *Knowledge Gaps* plus cohesion around 0.04 means the clustering is meaningless, not merely unlabeled. Usual cause is a framework identifier repeated per file (e.g. `export const metadata` in every Next.js App Router page → one orphan per route). **Not fixable**: `.graphifyignore` filters paths, not symbols, and hand-edits to `graph.json` are undone by the next `graphify update`. Report it; warn that labeling would name garbage clusters
- **Placeholder `Community N` labels**: report as degraded. Recovery is `graphify label . --missing-only --backend claude-cli` — no API key needed, but it spends the user's Claude plan quota, so confirm first. There is no `graphify update --fill-missing`
- **Broken `[[…]]` links after a wiki build**: raw-label vs slugged-filename mismatch — run `scripts/patch_wikilink.py` (see `wikilink-normalization-patch`), don't just regex the generated vault
- **Search-only request**: route to `codebase-search` instead of forcing a graph

## Neighboring ownership reminder
- `codebase-search` owns fast locate/reference/config impact work
- `llm-wiki` owns markdown knowledge-base synthesis and filing
- `opencontext` owns searchable project memory and cross-agent handoff
