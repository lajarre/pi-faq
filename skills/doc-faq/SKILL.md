---
name: doc-faq
description: >-
  Use when writing to or reading from configured FAQ_DIR
  or REF_DIR, or when deciding where to capture
  operational knowledge.
---

# doc-faq skill

Operational knowledge capture into `{FAQ_DIR}` and `{REF_DIR}`.

## knowledgebase resolution

`{FAQ_DIR}` and `{REF_DIR}` are resolved from the mandatory `knowledgeBase` config before this skill is used. Treat them as concrete configured directories:

- `{FAQ_DIR}` — terse Q&A, atomic `##` per learning
- `{REF_DIR}` — long-form procedures, how-tos

If the directories are not available, stop and report that the configured knowledgebase is unavailable. Do not choose another destination.

## routing

Route by depth: short gotchas → `{FAQ_DIR}`, multi-step guides → `{REF_DIR}`.

## provenance model

Every file has exactly one `## sessions` block. Each bullet records one session/path pair when the path is known:

```markdown
---

## sessions

- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/example-repo`
- 9a21... (retro import)
```

Do not create `## sources` or another provenance block. Add a bullet only when that session/path pair is not already present. Preserve pathless historical bullets when no source path is available.

## detailed rules

See `doc-faq-writing` skill for write protocol, formats, cross-linking, and provenance tracking.
