---
name: helper-mode
description: >-
  Use when /qna is activated or when the user is asking
  repeated questions about a topic (3+ turns of Q&A
  without implementation work).
---

# helper mode

Capture Q&A knowledge into `{FAQ_DIR}` and `{REF_DIR}`
as you answer. Activated via `/qna`, deactivated via
`/qna off`.

Writing conventions are inlined below this skill
when Q&A mode is active. Follow them for every write.

## the rule

**Every answer you give MUST produce a write to
`{FAQ_DIR}` (or `{REF_DIR}`).** This is not optional.
The user activated `/qna` to capture knowledge.

ONLY exception: your entire response is ≤1 sentence
AND contains no code, config, or commands.

**Never ask ANY variant of whether to write** —
"should I document?", "worth adding?", "want me to
save this?". The user said yes by activating `/qna`.

## workflow

1. `rg "^## " {FAQ_DIR}/` — search existing headings,
   then read any files that match the topic
2. decide: create / append `##` / update existing `##`
3. answer the question AND write to the appropriate dir
   (includes provenance)
4. mention: *"added to {FAQ_DIR}/terminal.md §copy-mode"*

Steps 1-3 are ONE turn. The rule (above) applies.

## typed section markers

Use typed prefixes in `##` headings for search and
dedup:

- `[gotcha]` — non-obvious behavior, footgun
- `[decision]` — choice made + rationale
- `[command]` — useful command or invocation
- `[config]` — configuration detail
- `[workaround]` — temporary fix, limitation bypass

Example: `## [gotcha] tmux clipboard fails on Sonoma`

## terseness

FAQ: 2-5 lines TOTAL per `##` — prose + code combined.

    ✅ ## [config] inline images
    `set -g allow-passthrough on` in `~/.tmux.conf`.
    ghostty forwards escape sequences for images.

    ❌ ## inline images
    To configure inline images in tmux with Ghostty...
    (too verbose, no type marker)

If deeper → 2-line faq + link to `{REF_DIR}`.

## session provenance — NON-NEGOTIABLE

Every file MUST end with `## sessions`. No exceptions.
UUID from `$PI_SESSION_ID` or `session_lineage`. Never
placeholder. Resolve before writing.

    ---
    ## sessions
    - 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)

## routing

- topic uncategorized → `{FAQ_DIR}/inbox.md`
  (only for faq content where topic is unclear)
- unsure faq vs ref → ask the user
- `inbox.md` is NOT a catch-all

## red flags — stop

- **answering without writing** → violation. write now
- **asking "should I document?"** or any variant →
  violation. user already said yes via `/qna`
- about to create a subfolder → ask user
- writing narrative → rewrite as reference
- duplicating existing `##` → update instead
- 3rd+ new file in session → pause, check for overlaps
