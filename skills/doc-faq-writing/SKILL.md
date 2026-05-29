---
name: doc-faq-writing
description: >-
  Use when about to write or update files in configured
  FAQ_DIR or REF_DIR. Covers format, structure, write
  protocol, provenance, and cross-linking conventions.
---

# doc-faq-writing skill

Writing library for `{FAQ_DIR}` and `{REF_DIR}`. These are resolved from the mandatory `knowledgeBase` config and already point at the configured `faq/` and `ref/` directories.

## write protocol

Before every write:

1. `rg "^## " {FAQ_DIR}/` — search existing headings across all files, not just filenames
2. read candidate files that match the topic
3. decide:
   - **create** new file → nothing covers it
   - **append** new `##` → topic fits existing file
   - **update** existing `##` → content outdated

No subfolders without user confirmation.

## file naming

**FAQ:** `inbox.md` for uncategorized, `<topic>.md` when clear. Graduate from inbox when 3+ sections on a recognizable topic accumulate.

**Ref:** `<topic>.md` — one per topic.

## format

**FAQ structure:**
- `#` — topic name (one per file)
- one-liner scope after `#`
- `##` — one learning per heading (atomic unit)
- no `###` or deeper
- telegraph style, no narrative
- `---` then exactly one `## sessions` block at end (mandatory)

**Ref structure:**
- `#` — topic name (one per file)
- brief living-doc header after `#`
- `##`, `###` as needed
- telegraph style, no narrative
- `## related` section for backlinks
- `---` then exactly one `## sessions` block at end (mandatory)

Do not create `## sources` or any separate source/provenance block.

## typed section markers

Use typed prefixes in `##` headings:

- `[gotcha]` — non-obvious behavior, footgun
- `[decision]` — choice made + rationale
- `[command]` — useful command or invocation
- `[config]` — configuration detail
- `[workaround]` — temporary fix

Example: `## [gotcha] tmux clipboard fails on Sonoma`

Improves search, dedup, and future migration.

## routing

- short answer, gotcha, config tip → `{FAQ_DIR}`
- procedure, howto, deep-dive → `{REF_DIR}`

## cross-linking

- faq → ref: `[full guide](../ref/foo.md)`
- ref → faq: `[quick notes](../faq/bar.md#section)`
- relative paths always

## provenance — MANDATORY

**Every file MUST end with exactly one `## sessions` block. No exceptions.**

```markdown
---

## sessions

- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/example-repo` @ {CAPTURE_DATE}
- 9a21... (retro import) @ {CAPTURE_DATE}
```

Append your session/path/date bullet using the capture date `{CAPTURE_DATE}`. Use the repo root if detectable, otherwise use the session cwd. If the path is unavailable, use `- <session> @ {CAPTURE_DATE}` without inventing a path. Do not write the word "captured". If the same session/path bullet already exists without a trailing date, update it instead of adding a duplicate. Get UUID from `$PI_SESSION_ID` or session lineage.

## write threshold

**Write:** non-obvious behavior, gotchas, config, decisions, how-to steps.

**Skip:** trivially googleable, one-off, already documented.
