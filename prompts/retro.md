---
name: retro
description: Extract learnings from a session into doc/faq/ and doc/ref/
---

Extract durable knowledge from {{SESSION_TARGET}}.

**REQUIRED:** read the `doc-faq-writing` skill first.

## error handling — check first

- if `session_ask` cannot find {{SESSION_TARGET}} →
  report "session not found" and stop
- if {{FAQ_DIR}} parent does not exist and cannot be
  resolved → report "area unresolvable" and stop

## extraction

1. Use `session_ask` to review {{SESSION_TARGET}}:
   "What non-obvious things were learned?
   Gotchas, config details, decisions, workarounds?"

2. For each learning, decide:
   - terse (gotcha, tip, config) → `{{FAQ_DIR}}`
   - detailed (howto, procedure) → `{{REF_DIR}}`

3. `rg "^## " {{FAQ_DIR}}/` and check `{{REF_DIR}}/`:
   - update existing file if topic matches
   - append new `##` section if topic fits
   - create new file only if nothing covers it
   - create dirs silently if absent

4. Write per `doc-faq-writing` conventions:
   - `#`/`##` structure, telegraph style
   - cross-link faq ↔ ref with relative paths
   - `## sessions` block at end of each file

5. After writing, summarize:
   - which files were created/updated
   - what was captured in each

6. If nothing worth documenting → say so and stop.
   If placement is genuinely ambiguous → ask.

## area

- doc root: {{DOC_ROOT}}
- faq dir: {{FAQ_DIR}}
- ref dir: {{REF_DIR}}
