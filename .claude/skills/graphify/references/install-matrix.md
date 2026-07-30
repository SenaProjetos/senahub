# Graphify Install Matrix

**Verified against graphify 0.9.29.**

Two separate things get installed. Do not conflate them.

1. **The CLI** — `pip install graphifyy` (PyPI package is `graphifyy`; the binaries are
   `graphify` and `graphify-mcp`). This is what actually builds and queries graphs. Every
   agent below needs it.
2. **The skill/integration** — a `SKILL.md` (plus hooks/plugins) placed where a specific agent
   looks for skills, so the agent knows to reach for `graphify` on its own.

```bash
pip install graphifyy          # or: pipx install graphifyy
graphify --version
```

Use `pipx` on macOS installs that report an externally-managed environment.

### Windows: the binary is often not on PATH

`pip install graphifyy` puts `graphify.exe` in the interpreter's `Scripts` dir, which is
frequently absent from PATH (pip warns about this). Two fixes, no PATH edit required:

```powershell
python -m graphify --version                 # works identically to the graphify binary
# or prefix calls with the resolved Scripts dir:
$env:PATH = "<...>\Python313\Scripts;" + $env:PATH
```

`python -m graphify` is the portable form — prefer it in scripts and docs.

---

## `graphify install --platform <id>`

`graphify install [--platform <id>] [--project]` copies the skill into a platform config dir.
The **complete** set of valid ids, captured from the CLI's own rejection message (this is
authoritative — the list printed by `graphify --help` is shorter and incomplete):

`claude` · `codex` · `opencode` · `kilo` · `aider` · `copilot` · `claw` · `droid` · `trae` ·
`trae-cn` · `hermes` · `kiro` · `pi` · `codebuddy` · `antigravity` · `antigravity-windows` ·
`windows` · `kimi` · `amp` · `agents` · `devin` · `gemini` · `cursor`

Plus the alias `skills` → `agents`.

```
$ graphify install --platform bogus-id-test
error: unknown platform 'bogus-id-test'. Choose from: claude, codex, opencode, kilo, aider,
copilot, claw, droid, trae, trae-cn, hermes, kiro, pi, codebuddy, antigravity,
antigravity-windows, windows, kimi, amp, agents, devin, gemini, cursor
```

**`agents` IS a valid id** — earlier versions of this document claimed it errors. It does not.
`vscode` and `vscode-copilot-chat` are **not** `--platform` ids, but `graphify vscode install`
exists as a subcommand (see below).

`--project` writes into the current repo instead of the user's home config.

| Command | Writes |
| --- | --- |
| `graphify install --platform agents` | `~/.agents/skills/graphify/SKILL.md` |
| `graphify install --platform agents --project` | `./.agents/skills/graphify/SKILL.md` |
| `graphify install --platform amp` | global: `~/.config/agents/skills/graphify/SKILL.md` (amp's own user root — **not** `~/.agents/skills`); with `--project`: `./.agents/skills/graphify/SKILL.md`, same as `agents` (`install.py:96-99`) |
| `graphify install --platform antigravity` | global: `~/.gemini/config/skills/graphify/SKILL.md`; with `--project`: `./.agents/skills/…` plus `.agents/rules/graphify.md` and `.agents/workflows/graphify.md` |
| `graphify install --platform opencode --project` | `.opencode/skills/graphify/SKILL.md`, `.opencode/plugins/graphify.js`, `.opencode/opencode.json` (`tool.execute.before` hook), plus a graphify section in `AGENTS.md` |
| `graphify install --platform claude --project` | `.claude/skills/graphify/SKILL.md`, `.claude/settings.json` PreToolUse hooks, plus a graphify section in `CLAUDE.md` |

## Per-platform subcommands

A parallel surface exists, one subcommand per platform, each with a matching `uninstall`:

`graphify claude install` · `gemini install` · `cursor install` · `codex install` ·
`opencode install` · `kilo install` · `aider install` · `copilot install` · `vscode install` ·
`codebuddy install` · `claw install` · `droid install` · `trae install` · `trae-cn install` ·
`antigravity install` · `hermes install` · `kiro install` · `pi install` · `devin install`

These write the agent-specific glue, not just a `SKILL.md`:

- `graphify claude install` → graphify section in `CLAUDE.md` + a PreToolUse hook
- `graphify gemini install` → `GEMINI.md` section + a BeforeTool hook
- `graphify cursor install` → `.cursor/rules/graphify.mdc`
- `graphify codex|aider|claw|droid|trae install` → `AGENTS.md` section
- `graphify opencode install` → `AGENTS.md` section + `tool.execute.before` plugin
- `graphify antigravity install` → `.agents/rules/graphify.md` + `.agents/workflows/graphify.md`
- `graphify copilot install` → `~/.copilot/skills/`
- `graphify vscode install` → skill + `.github/copilot-instructions.md`

## The shared `~/.agents/skills` root

`--platform agents` (alias `skills`) targets the generic cross-framework Agent-Skills root:

```bash
graphify install --platform agents            # -> ~/.agents/skills/graphify/SKILL.md
graphify install --platform agents --project  # -> ./.agents/skills/graphify/SKILL.md
```

Any Agent-Skills-compliant framework discovers that root, including `npx skills`. **No
`npx skills add … -a universal` step is needed** — an earlier version of this document
recommended that route because it wrongly believed `agents` was not a valid id.

> **Unverified:** earlier revisions asserted that `jeo`, `jeopi` and `gjc` read
> `~/.agents/skills` natively and have no platform id of their own. The first half is
> plausible (it is the spec'd shared root); the second is true only in the sense that those
> three names are not in the id list above. None of it has been checked against those tools
> here. Verify before repeating it, and never run `graphify install jeo` — that id does not
> exist.

## opencode — two products, one binary name

- **sst/opencode** (opencode.ai, TypeScript/Bun) has a native skill loader and reads
  `~/.config/opencode/skills/`, `~/.claude/skills/`, and `~/.agents/skills/`. Either route
  works: the shared `agents` root, or `graphify opencode install` for the plugin +
  `tool.execute.before` hook wiring.
- **opencode-ai/opencode** (the archived Go TUI, continued as charmbracelet/crush) has **no**
  skill loader — it only reads `.md` command files under `~/.opencode/commands/`,
  `$XDG_CONFIG_HOME/opencode/commands/`, and `<project>/.opencode/commands/`. Installing the
  skill will not make it discoverable there; bridge it as a command file or use the CLI directly.

## Recommended order for a fresh machine

```bash
pip install graphifyy                          # 1. CLI (verify: python -m graphify --version)
graphify install --platform agents             # 2. skill into the shared ~/.agents/skills root
graphify claude install                        # 3. optional: Claude Code section + hook
cd <your-repo>
graphify extract src --code-only --out .       # 4. prove it works, no API key needed
graphify cluster-only . --no-label
graphify god-nodes --top 15
```

Add `graphify-out/` to `.gitignore` — it is large (~10 MB on a 6000-node graph) and fully
regenerable with `graphify update .`.

## Uninstall

`graphify uninstall` removes graphify from **all** detected platform integrations in one shot.
`--purge` also deletes the `graphify-out/` directory. It does **not** uninstall the `graphifyy`
package — use `pip uninstall graphifyy` for that.
