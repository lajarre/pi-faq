---
name: doc-faq
description: >-
  Use when writing to or reading from doc/faq/ or
  doc/ref/, or when deciding where to capture
  operational knowledge.
---

# doc-faq skill

Operational knowledge capture into `doc/faq/` and
`doc/ref/`.

## doc root resolution

The extension resolves the doc root automatically:
- configured env var → directory containing that path
- no config → `$PWD/doc/`

Works with any project layout. For PARA-style setups
(areas, projects), configure `rootEnvVar` in
`extensions/config.json` to point at the relevant
root (e.g. `ORG_FILE`, `PROJECT_DIR`).

## two-folder model

- `doc/faq/` — terse Q&A, atomic `##` per learning
- `doc/ref/` — long-form procedures, how-tos

Route by depth: short gotchas → faq,
multi-step guides → ref.

## detailed rules

See `doc-faq-writing` skill for write protocol,
formats, cross-linking, and provenance tracking.
