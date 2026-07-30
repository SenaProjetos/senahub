---
name: graphify
description: >
  Drive Graphify from its CLI to build, refresh, query, and export a durable code/corpus
  knowledge graph. Use when the user wants `graphify-out/GRAPH_REPORT.md`, `graph.json`,
  `graph.html`, `graphify extract`/`update`/`query`/`explain`/`path`/`god-nodes`/`tree`,
  git-hook or watch-based refresh, or an install into Claude, Codex, Gemini, OpenCode,
  or the shared `~/.agents/skills` root. Also covers the honest structural fallback when
  native extraction is empty or misleading. Route simple locate/reference work to
  `codebase-search`, narrative knowledge-base work to `llm-wiki`, and project-memory
  handoff to `opencontext`. Triggers on: graphify, graphify update, graphify extract,
  graphify query, knowledge graph CLI, GRAPH_REPORT.md, graph.json, codebase graph,
  graph refresh, graphify install, god-nodes, affected.
allowed-tools: Bash Read Write Grep Glob
compatibility: >
  Verified against **graphify 0.9.29** (`graphifyy` on PyPI, Python 3.10+). If `graphify
  --version` reports something else, re-verify the command surface before trusting this
  file — see "Verifying against your installed version" below.
metadata:
  tags: knowledge-graph, codebase-analysis, graphrag, architecture, graphify, cli, corpus-analysis, persistent-memory
  platforms: Claude, Codex, Gemini, OpenCode, Cursor, Aider, agents
  version: "4.0"
  verified-against: "graphify 0.9.29"
  source: https://github.com/Graphify-Labs/graphify
---

# Graphify

Graphify is a **CLI**. The primary path for every request in this skill is a real
`graphify …` command, not a slash command and not an improvised Python script.

Use this skill when the main question is **"which graphify command answers this, over what
scope, and what should we read next?"**

The job is to:
1. classify the request into one graph packet,
2. choose one CLI mode,
3. scope the corpus before runtime or token cost explodes,
4. report artifacts and any degraded output truthfully,
5. route search-only, wiki-only, or project-memory work to the right neighboring skill.

Read [references/cli-command-map.md](references/cli-command-map.md) for the full command
surface with real flags.
Read [references/install-matrix.md](references/install-matrix.md) before installing anything.
Read [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md) for
an unfamiliar request, and [references/build-and-fallback-recipes.md](references/build-and-fallback-recipes.md)
when native extraction is weak.

## Verifying against your installed version

**`graphify --help` is incomplete — it omits real commands** (`export html`, `export wiki`,
`export obsidian`, `export svg`, `export graphml`, `export neo4j` are all implemented but
only `export callflow-html` is listed). Never conclude a command is missing from help output
alone. The authoritative list is the dispatch table:

```bash
python -c "import graphify,os;print(os.path.dirname(graphify.__file__))"
# then grep that dir: cli.py  ->  ^\s+(if|elif) cmd ==
```

Subcommand `--help` does not work: `graphify update --help` falls through to root help.

## CLI quickstart

```bash
pip install graphifyy                       # PyPI package is graphifyy; binaries are graphify + graphify-mcp
graphify --version

# first build, no API key needed (local AST only)
graphify extract . --code-only --out .      # -> ./graphify-out/graph.json
graphify cluster-only . --no-label          # -> ./graphify-out/GRAPH_REPORT.md

# refresh after code changes
graphify update .

# read it
graphify god-nodes --top 15                 # architectural hubs
graphify explain "<symbol>()"               # one node + its neighbours  <- sharpest tool
graphify path "<source>" "<target>"         # shortest path between two nodes
graphify affected "<symbol>" --depth 2      # reverse traversal: what breaks if this changes
graphify query "where is auth enforced?" --budget 1500   # BFS, saturates on big graphs

# human-viewable
graphify tree --root src --label MyRepo     # -> graphify-out/GRAPH_TREE.html (D3 collapsible, light)
graphify export html --node-limit 7000      # -> graphify-out/graph.html (force graph, heavy)
```

Facts that keep answers truthful:

- **`graphify build` does not exist.** First build is `graphify extract`; refresh is
  `graphify update`.
- **State lives in `graphify-out/`**, not `.graphify/`. Set by `GRAPHIFY_OUT` (default
  `"graphify-out"`, `graphify/paths.py:26`). Every `--graph <path>` flag defaults to
  `<cwd>/graphify-out/graph.json`. There is no `graphify migrate-state`.
- **`extract --out` defaults to `<path>`, not cwd.** `graphify extract src` writes to
  `src/graphify-out/` — inside the source tree, where no query command looks. **Always pass
  `--out .`.**
- **`graph.html` is not produced by `extract` or `cluster-only`.** It comes from
  `graphify export html`, and is **skipped above 5000 nodes** unless you pass
  `--node-limit N`. `graphify tree` has no node cap and is far lighter — prefer it.
- **These do not exist in 0.9.29:** `scope`, `summary`, `serve`, `migrate-state`,
  `portable-check`, `review-context`, `affected-flows`, `detect-changes`,
  `update --fill-missing`. The MCP server is the separate `graphify-mcp` binary, not a
  `graphify serve` subcommand.

## Labeling without an API key

Community names and descriptions need an LLM backend. Without one, clusters stay as
`Community N` placeholders. Backends: `gemini | kimi | claude | openai | deepseek | ollama |
bedrock | azure | claude-cli`.

**`claude-cli` needs no API key** — it shells out to the locally-installed `claude` binary
and bills the user's Claude Code subscription, not pay-as-you-go API credit:

```bash
graphify label . --missing-only --backend claude-cli
```

Forced to `max_concurrency=1` (parallel subprocesses corrupt the session) unless
`GRAPHIFY_CLAUDE_CLI_PARALLEL=1`. `GRAPHIFY_CLAUDE_CLI_MODEL=haiku` picks a cheaper model.
**It spends the user's plan quota — confirm before running it, don't default to it.**

## When to use this skill

- The user explicitly wants `GRAPH_REPORT.md`, `graph.json`, `graph.html`, a codebase graph, or
  a persistent knowledge graph
- The request is about repo/corpus structure, relationship tracing, path queries, or
  architecture discovery that should survive the current session
- The corpus mixes code, docs, PDFs, notes, or screenshots and the user wants one durable
  structure layer
- The user wants to refresh, query, or explain an existing graph instead of re-reading raw files
- The user wants Graphify installed into an agent

## When not to use this skill

- **Only needs to find a symbol, file owner, config location, or reference chain** → `codebase-search`
- **Wants a persistent markdown knowledge base or filed research notes** → `llm-wiki`
- **Wants project/repo memory, manifests, or cross-agent handoff packets** → `opencontext`
- **Needs dependency-only JS/TS analysis or a quick repo tree diagram**, not a durable graph
- **Generic GraphRAG / text-KG architecture talk** with no concrete Graphify ask

## Install

Two parallel surfaces, both real:

```bash
graphify install --platform <id>     # generic installer
graphify <platform> install          # per-platform subcommand (claude, gemini, cursor, codex,
                                     #   opencode, kilo, aider, copilot, vscode, claw, droid,
                                     #   trae, trae-cn, codebuddy, antigravity, hermes, kiro,
                                     #   pi, devin)
```

`--platform` ids accepted by the generic installer: `claude`, `windows`, `codebuddy`, `codex`,
`opencode`, `aider`, `amp`, `agents`, `claw`, `droid`, `trae`, `trae-cn`, `gemini`, `cursor`,
`antigravity`, `hermes`, `kiro`, `pi`, `devin`. `skills` is an alias for `agents`.

**`agents` is the shared-root id** — it writes `~/.agents/skills/graphify/SKILL.md` globally
(or `./.agents/skills/…` with `--project`), which is the root any Agent-Skills-compliant
framework discovers. No `npx skills add` needed:

```bash
pip install graphifyy && graphify --version
graphify install --platform agents          # -> ~/.agents/skills/graphify/SKILL.md
```

`graphify claude install` writes a graphify section to `CLAUDE.md` + a PreToolUse hook.
`graphify opencode install` writes an `AGENTS.md` section + a `tool.execute.before` plugin.
`graphify uninstall` removes graphify from **all** detected platforms at once
(`--purge` also deletes `graphify-out/`). Full detail:
[references/install-matrix.md](references/install-matrix.md).

## Instructions

### Step 1: Normalize the request into one packet

- `repo-structure-packet` — map a codebase or subsystem before editing
- `relationship-trace-packet` — answer a path/query/explain question from an existing graph
- `mixed-corpus-memory-packet` — build durable structure across code + docs + assets
- `review-diff-packet` — produce impact context for changed files
- `install-packet` — get Graphify into an agent for always-on use
- `refresh-or-fallback-packet` — update an existing graph, recover from weak output, or fall back

Start from the packet the user already has. Do not force every request through a feature tour.

### Step 2: Pick one CLI mode

| Mode | Primary commands |
| --- | --- |
| `cli-build` | `graphify extract <path> --code-only --out .` → `graphify cluster-only . --no-label` |
| `cli-query` | `god-nodes` → `explain` / `path` / `affected` / `query --budget N` |
| `cli-export` | `graphify tree` · `graphify export html\|wiki\|obsidian\|svg\|graphml\|neo4j\|falkordb` |
| `incremental-refresh` | `graphify check-update` → `graphify update` / `watch` / `hook install` |
| `impact-context` | `graphify affected "<sym>"` · `graphify prs` · `graphify diagnose multigraph` |
| `labeling` | `graphify label . --missing-only --backend claude-cli` (**costs plan quota — confirm**) |
| `install` | `graphify install --platform <id>` or `graphify <platform> install` |
| `structural-fallback` | build the smallest truthful structural graph when native extraction is empty or misleading |

Name one primary mode. Mention at most one fallback.

### Step 3: Scope before spending

There is **no `graphify scope`**. Estimate the corpus yourself before an expensive build —
count files by extension, then pick a directory. Good defaults:

- repo root only when repo-wide architecture is genuinely the ask
- `src/`, `app/`, `packages/<pkg>/`, or one service directory for implementation work
- `raw/`, `docs/`, or a mixed research folder for corpus graphing
- an existing `graphify-out/` when the job is query/refresh rather than rebuild

`extract` honors `.gitignore` (disable with `--no-gitignore`) and `.graphifyignore`.
**`.graphifyignore` filters paths, not symbols** — it cannot suppress a noisy identifier.
If the request is really locate/reference, route to `codebase-search`.

### Step 4: Run the narrowest command set

Keep it to the commands the mode needs. Do not chain a build, an export, a wiki, and a watch
loop when the user asked one question. Run `extract` with a long timeout or in the background —
a large repo takes minutes and a mid-build timeout leaves ambiguous partial state.

### Step 5: Report degraded output honestly

Two independent failure modes — do not conflate them:

**Missing labels.** No backend configured → all clusters are `Community N`, no descriptions.
Say so; offer `graphify label . --missing-only --backend claude-cli` (with the quota caveat).

**Noise-dominated partition.** A high isolated-node count in `GRAPH_REPORT.md`'s *Knowledge
Gaps* section, plus community cohesion around 0.04, means the clustering is structurally
meaningless — not merely unnamed. Common cause: a framework identifier repeated in every file
(e.g. `export const metadata` in every Next.js App Router page produces one orphan per route).
**This is not fixable** — `.graphifyignore` filters paths, not symbols, and any hand-edit of
`graph.json` is undone by the next `graphify update`. Report it as a known limitation of AST
extraction, and warn that labeling would put real names on garbage clusters.

Never present placeholder `Community N` names as meaningful clusters.

### Step 6: Read artifacts in order

1. `graphify-out/GRAPH_REPORT.md` — read **God Nodes**, **Surprising Connections**, **Import
   Cycles**, **Knowledge Gaps**. Skip the community list when labels are placeholders.
2. `graphify god-nodes --top 15` and `graphify explain "<node>"` — the sharpest agent tools
3. `graphify-out/GRAPH_TREE.html` for humans (light); `graph.html` only if a force graph is wanted
4. `graphify-out/graph.json` last, and prefer `graphify query --budget <n>` over pasting it

Sanity-check the graph before trusting it: the top god-nodes should be abstractions you
recognize. If they aren't, extraction resolved poorly.

### Step 7: Route adjacent work outward

- `codebase-search` — exact text, symbol, config ownership, impact mapping before graphing
- `llm-wiki` — narrative synthesis, wiki pages, long-lived markdown knowledge bases
- `opencontext` — searchable decisions, manifests, stable links, project-memory handoff
- `survey` — tool/platform comparison before committing to Graphify

If the user asks "build or query the graph," stay here. If they ask "find the file fast," "file
this as a wiki note," or "store this as project memory," route out.

### Step 8: Return one concise graph brief

Packet · primary mode · commands actually run · scope · artifacts written · whether output was
degraded or fallback · 1–3 next commands · one route-out if the next step belongs elsewhere.

## Output format

Always return a **graph build brief**, **graph query brief**, **graph refresh brief**, **impact
context brief**, or **Graphify install brief** with:

- the packet in hand and one primary mode
- the real commands run, with their scope
- which files under `graphify-out/` exist or were created
- honest labeling of degraded, placeholder, or fallback output
- coverage stated as *indexed / total*, with the reason for any gap
- `GRAPH_REPORT.md` + `god-nodes` read before raw `graph.json`
- one route-out when neighboring work now owns the next step

## Examples

### Example 1: understand a repo before editing
**Input**
> Map this repo so I can understand the architecture before touching code.

**Good output direction**
- `repo-structure-packet`, mode `cli-build`
- count files → `graphify extract src --code-only --out .` → `graphify cluster-only . --no-label`
  → `graphify god-nodes --top 15`
- reports `graphify-out/GRAPH_REPORT.md` + `graph.json`, states coverage (indexed/total and why),
  and that `graph.html` needs `graphify export html`

### Example 2: trace a relationship from an existing graph
**Input**
> We already have a graph. What connects the auth controller to billing?

**Good output direction**
- `relationship-trace-packet`, mode `cli-query`
- `graphify path "<auth>" "<billing>"` → `graphify explain "<node>"`
- no rebuild

### Example 3: what breaks if I change this
**Input**
> What depends on this function? I want impact, not a diff dump.

**Good output direction**
- `review-diff-packet`, mode `impact-context`
- `graphify affected "<symbol>" --depth 2`
- states plainly that `review-context` / `affected-flows` are **not** commands in 0.9.29 —
  `impact-context` is a mode label in this skill, not a CLI subcommand

### Example 4: install for our agents
**Input**
> Install graphify for our agents.

**Good output direction**
- `install-packet`
- `pip install graphifyy`, then `graphify install --platform agents` → `~/.agents/skills/`
- per-agent extras via `graphify claude install` / `graphify opencode install`

### Example 5: request is really search
**Input**
> I just need to find where this config is defined and who references it.

**Good output direction**
- routes to `codebase-search`; does not build a graph

## Best practices
1. Lead with a real `graphify` command; never invent one — `graphify build`, `scope`, `summary`,
   and `serve` do not exist.
2. Verify against the `cli.py` dispatch table, not `graphify --help` — the help text is incomplete.
3. Always pass `--out .` to `extract`; the default writes inside the scanned directory.
4. Write `graphify-out/`, not `.graphify/`. Add it to `.gitignore` — it is large and regenerable.
5. Count the corpus yourself before an expensive build; there is no `graphify scope`.
6. Prefer `GRAPH_REPORT.md` + `god-nodes` + `explain` over raw `graph.json`; `query` is BFS and
   saturates on large graphs — cap it with `--budget <n>`.
7. Report placeholder `Community N` labels **and** a noise-dominated partition as two separate
   degradations, not one.
8. Confirm before `--backend claude-cli`: it spends the user's Claude plan quota.
9. Use `graphify hook install` or `graphify watch` for ongoing freshness instead of ad-hoc rebuilds.
10. Prefer `graphify tree` over `export html` for anything above ~5000 nodes.
11. Treat structural fallback as a first-class honest mode, not a hidden failure.
12. Route search-first work to `codebase-search`, narrative memory to `llm-wiki`, project memory
    to `opencontext`.
13. After a graphify wiki build — or any `pip install --upgrade graphifyy` — run
    `scripts/patch_wikilink.py` if `[[…]]` links look broken. graphify's generator emits
    raw-label `[[Community 36]]` links that never resolve to its slugged `Community_36.md` pages;
    the patcher normalizes every link site to `[[slug|label]]` and is idempotent.

## References
- [CLI command map](references/cli-command-map.md) — every command and flag, grouped by job
- [Install matrix](references/install-matrix.md) — platform ids and install routes
- [Mode packets and route-outs](references/mode-packets-and-route-outs.md)
- [Build and fallback recipes](references/build-and-fallback-recipes.md)
- [`scripts/patch_wikilink.py`](scripts/patch_wikilink.py) — idempotent wikilink-normalization patch (`--self-test`, `--check`)
- `../codebase-search/SKILL.md` · `../llm-wiki/SKILL.md` · `../opencontext/SKILL.md`
- Graphify upstream: https://github.com/Graphify-Labs/graphify
- Graphify PyPI: https://pypi.org/project/graphifyy/
