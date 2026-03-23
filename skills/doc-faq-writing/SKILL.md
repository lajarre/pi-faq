---
name: doc-faq-writing
description: >-
  Use when about to write or update files in doc/faq/
  or doc/ref/. Covers format, structure, write protocol,
  provenance, and cross-linking conventions.
---

# doc-faq-writing skill

Writing library for `{FAQ_DIR}` and `{REF_DIR}`.

## write protocol

Before every write:

1. `rg "^## " {FAQ_DIR}/` — search existing headings
   across all files, not just filenames
2. read candidate files that match the topic
3. decide:
   - **create** new file → nothing covers it
   - **append** new `##` → topic fits existing file
   - **update** existing `##` → content outdated

No subfolders without user confirmation.

## file naming

**FAQ:** `inbox.md` for uncategorized, `<topic>.md`
when clear. Graduate from inbox when 3+ sections on
a recognizable topic accumulate.

**Ref:** `<topic>.md` — one per topic.

## format

**FAQ structure:**
- `#` — topic name (one per file)
- one-liner scope after `#`
- `##` — one learning per heading (atomic unit)
- no `###` or deeper
- telegraph style, no narrative
- `---` then `## sessions` at end (mandatory)

**Ref structure:**
- `#` — topic name (one per file)
- brief living-doc header after `#`
- `##`, `###` as needed
- telegraph style, no narrative
- `## related` section for backlinks
- `---` then `## sessions` at end (mandatory)

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

**Every file MUST end with this block. No exceptions.**

```markdown
---

## sessions

- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)
```

Append your ID to existing lists. Get UUID from
`$PI_SESSION_ID`.

## write threshold

**Write:** non-obvious behavior, gotchas, config,
decisions, how-to steps.

**Skip:** trivially googleable, one-off, already
documented.
