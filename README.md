# pi-faq

Capture operational knowledge into a mandatory configured knowledgebase — terse FAQ notes and long-form reference docs, with session and project provenance for traceability.

## install

```bash
pi install git:github.com/lajarre/pi-faq
```

## configure first

Create `~/.pi/agent/config/pi-faq.json` before using `/qna` or `/retro`:

```json
{
  "knowledgeBase": "~/k/agent"
}
```

`knowledgeBase` is the document root. It must be an absolute path or start with `~/`. No fallback destination is used.

## quickstart

```text
/qna              # activate Q&A capture mode after config resolves
                  # ask questions — docs are written after answers
/qna off          # deactivate

/retro             # extract learnings from current session
/retro <session>   # extract from a past session
```

## what it does

When `/qna` is active, pi-faq resolves the configured knowledgebase, ensures `<knowledgeBase>/faq/` and `<knowledgeBase>/ref/` exist, then asks the agent to write a terse FAQ entry after each answer. Detailed content goes to reference docs with cross-links between the two folders.

When you run `/retro`, pi-faq resolves the same configured knowledgebase, ensures the direct `faq/` and `ref/` children exist, then sends a retro prompt to extract non-obvious learnings from the current or named session.

Both commands are user-triggered — the agent may suggest them but never activates without consent. If config is missing, invalid, or directories cannot be created, `/qna` stays off and `/retro` stops before sending extraction guidance.

During `before_agent_start`, pi-faq adds a terse search hint only when valid config resolves and either configured docs folder exists. It does not invent another destination. If Q&A mode was active but config later becomes unusable, the hook injects only a short unavailable note instead of write obligations.

## knowledgebase structure

```text
<knowledgeBase>/
├── faq/
│   ├── terminal.md          # terse: ## per learning
│   ├── python.md
│   └── inbox.md             # uncategorized, pending triage
└── ref/
    └── tmux-clipboard.md    # long-form reference
```

**FAQ files** use a flat `#`/`##` structure:

```markdown
# terminal

terminal stack: ghostty, tmux, pi.

## [config] inline images

`set -g allow-passthrough on` in `~/.tmux.conf`.

## [gotcha] clipboard fails on Sonoma

use OSC 52 instead of pbcopy.
see [full guide](../ref/tmux-clipboard.md).

---

## sessions

- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/example-repo`
```

### typed markers

Sections use typed prefixes for search and dedup: `[gotcha]`, `[decision]`, `[command]`, `[config]`, `[workaround]`.

### provenance

Every file ends with one `## sessions` block. Each bullet combines session identity and originating project path when known:

```markdown
- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/example-repo`
- 9a21... (retro import)
```

Use the repo root when detectable, otherwise the session cwd. Preserve pathless session bullets when the path is unavailable. Do not add a separate sources block.

## migration

Use the explicit migration command for existing repo-local `doc/faq` and `doc/ref` markdown files:

```bash
npm run migrate
npm run migrate -- --apply
npm run migrate -- --apply --write-conflicts
```

Run the migration in dry-run mode first. Review the create, merge, conflict, and skip summary before adding `--apply`. Migration writes into the configured knowledgebase; source docs are not deleted, moved, or modified.

## what's included

| Resource | Type | Purpose |
|----------|------|---------|
| `/qna` | command | toggle Q&A capture mode |
| `/retro` | command | extract session learnings |
| `qna_mode` | tool | advisory: suggest `/qna` |
| `retro` | tool | advisory: suggest `/retro` |
| `doc-faq` | skill | convention index |
| `doc-faq-writing` | skill | write protocol library |

## for you / not for you

**For you if** you want agents to accumulate durable knowledge as searchable docs — gotchas, config tips, decisions, procedures — instead of losing them in session history.

**Not for you if** you want vector-store RAG, automatic memory without user consent, or a full knowledge graph. This is curated markdown, not a database.

## license

MIT
