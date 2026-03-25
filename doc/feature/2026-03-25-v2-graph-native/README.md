# v2: graph-native knowledge system

pi-faq v2 — from structured docs to graph-native
Obsidian-compatible knowledge capture.

## status

shaping / early research

## problem

v1 works but has friction:

- PARA-flavored area resolution (env var → dirname →
  doc/) is over-engineered for most uses
- `doc/faq/` + `doc/ref/` split imposes structure
  where association would serve better
- cross-references could be more graph-friendly
- sessions have no ambient awareness that docs exist
  (the before_agent_start gap)
- similar to but distinct from agent memory systems
  (pi-memory, arscontexta) — pi-faq is a *wiki*,
  not a *memory*

## direction

from three-tradition synthesis (see
[synthesis.md](synthesis.md)):

### keep
- explicit consent model (`/qna`, `/retro`)
- terse entries with typed markers
- session provenance
- plain markdown, no database, no lock-in

### change
- graph-friendly cross-references (see linking below)
- flat graph topology (not faq/ref tree)
- simplified discovery: project-local or vault path
- ambient agent hint via `before_agent_start`
- optional MOCs (emergent, not imposed)

### the four rules (from synthesis)

1. one file, one idea (markdown, title as filename)
2. cross-references as links (see linking below)
3. capture → link → revisit (update function)
4. plain text only (no db, no proprietary format)

### linking: standard markdown, wikilinks optional

`[[wikilinks]]` are NOT standard markdown (not in
CommonMark, not in GFM). they don't render on GitHub,
and agents can't follow them without a resolver.

the default is **standard markdown links**:
- `[foo](./foo.md)` — agents can `read` directly
- renders everywhere (GitHub, any md viewer)
- paths are short when docs are colocated

**wikilinks are supported but optional:**
- in an Obsidian vault, users can use `[[foo]]`
- agents won't auto-traverse them but won't choke
- obsidian gives rename-safety and graph view for free

the agent sidesteps link resolution entirely: the
`before_agent_start` hint says "search doc/ with rg".
link format doesn't matter for agent discovery.

| | standard links | `[[wikilinks]]` |
|---|---|---|
| agent can follow | yes | needs resolver |
| github renders | yes | no |
| obsidian graph | yes (with paths) | yes |
| rename-safe | no | yes (obsidian) |
| writing speed | slower | faster |
| CommonMark | yes | no |

**rule of thumb:** code repo → standard links.
personal obsidian vault → wikilinks fine.

## artifacts

- [synthesis.md](synthesis.md) — omniscient synthesis
  (3 lenses: systems theory, computation, phenomenology)

## open questions

- backward compat: can v2 coexist with v1 faq/ref?
- vault mode: global KB path vs project-local — how
  to configure without PARA indirection?
- MOC generation: when does an index note get created?
  threshold (5+ entries on a topic)? manual?
- should typed markers (`[gotcha]`, `[decision]`)
  become tags (`#gotcha`, `#decision`)?
- the staleness problem: frontmatter `updated:` field?
  git log? both?

## resources

- [arscontexta](https://github.com/agenticnotetaking/arscontexta)
  — agent "second brain", 249 research claims, MOCs
- [pi-memory](https://github.com/jayzeng/pi-memory)
  — pi extension: MEMORY.md + daily logs + qmd search
- [skills vs MCP](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/)
  — ronacher on why markdown skills beat MCP tools
- [shipping at inference speed](https://steipete.me/posts/2025/shipping-at-inference-speed)
  — steipete on docs/ folder + docs-list pattern
- [pi-subdir-context](https://github.com/default-anton/pi-subdir-context)
  — dynamic AGENTS.md injection on read
- [pi-vibecheck repo-docs.ts](https://github.com/ctriolo/pi-vibecheck)
  — docs inventory + first-turn system prompt hint
