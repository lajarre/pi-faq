---
name: retro
description: Extract learnings from a session into the configured knowledgebase
---

Extract durable knowledge from {SESSION_TARGET} into the configured knowledgebase.

**REQUIRED:** read the `doc-faq-writing` skill first.

{FOCUS}

## error handling — check first

- if `session_ask` cannot find {SESSION_TARGET} → report "session not found" and stop
- if config is missing, invalid, or directories cannot be used → report "knowledgebase unavailable" and stop

## extraction

1. Use `session_ask` to review {SESSION_TARGET}:
   "What non-obvious things were learned?
   Gotchas, config details, decisions, workarounds?
   What cwd/project context was this session using?"
   {FOCUS_QUERY}

2. Preserve project context:
   - current source path: `{SOURCE_PATH}`
   - for past sessions, ask for cwd/project context when possible
   - if the path is unavailable, keep the session bullet without inventing a path

3. For each learning, decide:
   - terse (gotcha, tip, config) → `{FAQ_DIR}`
   - detailed (howto, procedure) → `{REF_DIR}`

4. `rg "^## " {FAQ_DIR}/` and check `{REF_DIR}/`:
   - update existing file if topic matches
   - append new `##` section if topic fits
   - create new file only if nothing covers it

5. Write per `doc-faq-writing` conventions:
   - `#`/`##` structure, telegraph style
   - cross-link faq ↔ ref with relative paths
   - exactly one `## sessions` block at end of each file
   - include source path in the session bullet when known
   - preserve pathless provenance when source path is unavailable

6. After writing, summarize:
   - which files were created/updated
   - what was captured in each

7. If nothing worth documenting → say so and stop.
   If placement is genuinely ambiguous → ask.

## knowledgebase

- knowledgebase: {KNOWLEDGE_BASE}
- faq dir: {FAQ_DIR}
- ref dir: {REF_DIR}
- source path: {SOURCE_PATH}
