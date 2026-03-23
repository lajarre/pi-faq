# pi-faq

Capture operational knowledge into `doc/faq/` and
`doc/ref/` as you work — terse Q&A notes and long-form
reference docs, with session provenance for traceability.

## install

```bash
pi install git:github.com/lajarre/pi-faq
```

## quickstart

```
/qna              # activate Q&A capture mode
                  # ask questions — docs are written
                  # automatically after each answer
/qna off          # deactivate

/retro             # extract learnings from current session
/retro <session>   # extract from a past session
```

## what it does

When `/qna` is active, the agent writes a terse FAQ
entry to `doc/faq/` after every answer. Detailed
content (procedures, how-tos) goes to `doc/ref/`
with cross-links between the two.

When you run `/retro`, the agent reviews the session
(via `session_ask`), extracts non-obvious learnings,
and writes them to the same folders.

Both commands are user-triggered — the agent may
suggest them but never activates without consent.

## doc structure

```
doc/
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

- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)
```

### typed markers

Sections use typed prefixes for search and dedup:
`[gotcha]`, `[decision]`, `[command]`, `[config]`,
`[workaround]`.

### provenance

Every file ends with a `## sessions` block listing
contributing session UUIDs. Use `session_ask` to dig
deeper into any session.

## configuration

Create `extensions/config.json` next to the extension:

```json
{
  "rootEnvVar": "ORG_FILE",
  "rootEnvVarIsFile": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `rootEnvVar` | none | env var for doc root |
| `rootEnvVarIsFile` | `true` | if true, take `dirname` |

Without config, docs go to `$PWD/doc/faq/` and
`$PWD/doc/ref/`.

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

**For you if** you want agents to accumulate durable
knowledge as searchable docs — gotchas, config tips,
decisions, procedures — instead of losing them in
session history.

**Not for you if** you want vector-store RAG, automatic
memory without user consent, or a full knowledge graph.
This is curated markdown, not a database.

## license

MIT
