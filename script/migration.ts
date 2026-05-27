import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  appendUniqueSessionBullet,
  formatMigrationBullet,
} from '../extensions/provenance.ts';

export type DocKind = 'faq' | 'ref';
export type MigrationKind = 'create' | 'merge' | 'conflict' | 'skip duplicate';

type NamedDirent = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
};

export interface ScannedDoc {
  kind: DocKind;
  sourcePath: string;
  sourceProjectRoot: string;
}

export interface MarkdownSection {
  heading: string;
  content: string;
}

export interface MigrationConflict {
  heading: string;
  destinationContent: string;
  incomingContent: string;
}

export interface MigrationItem {
  kind: MigrationKind;
  docKind: DocKind;
  sourcePath: string;
  destinationPath: string;
  sourceProjectRoot: string;
  mergeSections: MarkdownSection[];
  duplicateSections: string[];
  conflicts: MigrationConflict[];
}

export interface MigrationSummary {
  creates: number;
  merges: number;
  conflicts: number;
  duplicates: number;
}

export interface MigrationPlan {
  knowledgeBase: string;
  items: MigrationItem[];
  summary: MigrationSummary;
}

export interface ScanLocalDocsOptions {
  home: string;
}

export interface CreateMigrationPlanOptions {
  home: string;
  knowledgeBase: string;
  sources: ScannedDoc[];
}

export interface ApplyMigrationPlanOptions {
  home: string;
  apply: true;
  writeConflicts: boolean;
  conflictDir?: string;
  now?: Date;
}

interface ParsedMarkdown {
  bodyWithoutSessions: string;
  sessions: string[];
  sections: MarkdownSection[];
}

const MAX_PROJECT_DEPTH = 5;

export async function scanLocalDocs(
  options: ScanLocalDocsOptions
): Promise<ScannedDoc[]> {
  const roots = [join(options.home, 'workspace'), join(options.home, 'p')];
  const results: ScannedDoc[] = [];

  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    await scanProjectCandidates(root, 0, results);
  }

  return results.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

async function scanProjectCandidates(
  current: string,
  depth: number,
  results: ScannedDoc[]
): Promise<void> {
  if (depth > 0) {
    await collectDocFiles(current, results);
  }

  if (depth >= MAX_PROJECT_DEPTH) {
    return;
  }

  let entries: NamedDirent[];
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `failed to scan migration directory ${current}: ${messageFromError(error)}`
    );
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'doc') {
      continue;
    }
    await scanProjectCandidates(join(current, entry.name), depth + 1, results);
  }
}

async function collectDocFiles(
  projectRoot: string,
  results: ScannedDoc[]
): Promise<void> {
  for (const kind of ['faq', 'ref'] as const) {
    const dir = join(projectRoot, 'doc', kind);
    let entries: NamedDirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw new Error(
          `failed to scan local docs directory ${dir}: ${messageFromError(error)}`
        );
      }
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push({
          kind,
          sourcePath: join(dir, entry.name),
          sourceProjectRoot: projectRoot,
        });
      }
    }
  }
}

export async function createMigrationPlan(
  options: CreateMigrationPlanOptions
): Promise<MigrationPlan> {
  const items: MigrationItem[] = [];
  const destinationContents = new Map<string, string>();

  for (const source of options.sources) {
    const destinationPath = join(options.knowledgeBase, source.kind, basename(source.sourcePath));
    const sourceContent = await readFile(source.sourcePath, 'utf-8');
    let destinationContent = destinationContents.get(destinationPath);

    if (destinationContent === undefined) {
      destinationContent = existsSync(destinationPath)
        ? await readFile(destinationPath, 'utf-8')
        : undefined;
    }

    if (destinationContent === undefined) {
      items.push({
        kind: 'create',
        docKind: source.kind,
        sourcePath: source.sourcePath,
        destinationPath,
        sourceProjectRoot: source.sourceProjectRoot,
        mergeSections: [],
        duplicateSections: [],
        conflicts: [],
      });
      destinationContents.set(
        destinationPath,
        addMigrationProvenance(sourceContent, source.sourceProjectRoot, options.home)
      );
      continue;
    }

    const sourceMarkdown = parseMarkdown(sourceContent);
    const destinationMarkdown = parseMarkdown(destinationContent);
    const mergeSections: MarkdownSection[] = [];
    const duplicateSections: string[] = [];
    const conflicts: MigrationConflict[] = [];

    for (const sourceSection of sourceMarkdown.sections) {
      const destinationSection = destinationMarkdown.sections.find(
        (section) => section.heading === sourceSection.heading
      );

      if (!destinationSection) {
        mergeSections.push(sourceSection);
        continue;
      }

      if (normalizeSectionContent(destinationSection.content) === normalizeSectionContent(sourceSection.content)) {
        duplicateSections.push(sourceSection.heading);
        continue;
      }

      conflicts.push({
        heading: sourceSection.heading,
        destinationContent: destinationSection.content,
        incomingContent: sourceSection.content,
      });
    }

    items.push({
      kind: classifyExistingFile(mergeSections, conflicts),
      docKind: source.kind,
      sourcePath: source.sourcePath,
      destinationPath,
      sourceProjectRoot: source.sourceProjectRoot,
      mergeSections,
      duplicateSections,
      conflicts,
    });

    if (mergeSections.length > 0) {
      destinationContents.set(
        destinationPath,
        mergeMarkdown(
          destinationContent,
          sourceContent,
          mergeSections,
          source.sourceProjectRoot,
          options.home
        )
      );
    }
  }

  return {
    knowledgeBase: options.knowledgeBase,
    items,
    summary: summarize(items),
  };
}

export function renderMigrationPlan(plan: MigrationPlan): string {
  const lines = ['pi-faq docs migration dry-run', ''];

  if (plan.summary.merges > 0) {
    lines.push('merges will happen:');
    for (const item of plan.items.filter((candidate) => candidate.kind === 'merge')) {
      lines.push(`  - ${item.sourcePath} -> ${item.destinationPath}`);
    }
    lines.push('');
  }

  for (const item of plan.items) {
    lines.push(`${item.kind}: ${item.sourcePath} -> ${item.destinationPath}`);
    if (item.mergeSections.length > 0) {
      lines.push(`  merge headings: ${item.mergeSections.map((section) => section.heading).join(', ')}`);
    }
    if (item.conflicts.length > 0) {
      lines.push(`  conflict headings: ${item.conflicts.map((conflict) => conflict.heading).join(', ')}`);
    }
  }

  lines.push('');
  lines.push('summary:');
  lines.push(`  creates: ${plan.summary.creates}`);
  lines.push(`  merges: ${plan.summary.merges}`);
  lines.push(`  conflicts: ${plan.summary.conflicts}`);
  lines.push(`  skip duplicates: ${plan.summary.duplicates}`);

  return `${lines.join('\n')}\n`;
}

export async function applyMigrationPlan(
  plan: MigrationPlan,
  options: ApplyMigrationPlanOptions
): Promise<void> {
  const hasConflicts = plan.items.some((item) => item.conflicts.length > 0);
  if (hasConflicts && !options.writeConflicts) {
    throw new Error('refusing to apply migration with conflicts; rerun with --write-conflicts to write sidecars');
  }

  if (hasConflicts && options.writeConflicts) {
    const conflictDir = options.conflictDir ?? defaultConflictDir(plan.knowledgeBase, options.now ?? new Date());
    await writeConflictSidecars(plan, conflictDir);
  }

  for (const item of plan.items) {
    if (item.kind === 'create') {
      const sourceContent = await readFile(item.sourcePath, 'utf-8');
      const content = addMigrationProvenance(
        sourceContent,
        item.sourceProjectRoot,
        options.home
      );
      await mkdir(dirname(item.destinationPath), { recursive: true });
      await writeFile(item.destinationPath, content, { encoding: 'utf-8', flag: 'wx' });
      continue;
    }

    if (item.mergeSections.length > 0) {
      const sourceContent = await readFile(item.sourcePath, 'utf-8');
      const destinationContent = await readFile(item.destinationPath, 'utf-8');
      const merged = mergeMarkdown(
        destinationContent,
        sourceContent,
        item.mergeSections,
        item.sourceProjectRoot,
        options.home
      );
      await writeFile(item.destinationPath, merged, 'utf-8');
    }
  }
}

export function defaultConflictDir(knowledgeBase: string, now: Date): string {
  return join(knowledgeBase, '.pi-faq-conflicts', timestampForPath(now));
}

function parseMarkdown(markdown: string): ParsedMarkdown {
  const headingMatches = [...markdown.matchAll(/^## (?<heading>.+?)[ \t]*$/gm)];
  const sections: MarkdownSection[] = [];
  const sessions: string[] = [];
  let bodyWithoutSessions = '';
  let cursor = 0;

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const start = match.index ?? 0;
    const nextStart = headingMatches[index + 1]?.index ?? markdown.length;
    const raw = markdown.slice(start, nextStart);
    const heading = match.groups?.heading ?? '';

    bodyWithoutSessions += markdown.slice(cursor, start);
    if (heading.toLowerCase() === 'sessions') {
      sessions.push(...raw.split('\n').filter((line) => line.startsWith('- ')));
    } else {
      sections.push({ heading, content: sectionContent(raw) });
      bodyWithoutSessions += raw;
    }
    cursor = nextStart;
  }

  bodyWithoutSessions += markdown.slice(cursor);

  return {
    bodyWithoutSessions: stripTrailingSessionsSeparator(bodyWithoutSessions),
    sessions,
    sections,
  };
}

function sectionContent(rawSection: string): string {
  const lines = rawSection.split('\n');
  lines.shift();
  return lines.join('\n').replace(/\n---\s*$/u, '').trim();
}

function normalizeSectionContent(content: string): string {
  return content.trim().replace(/\r\n/g, '\n');
}

function classifyExistingFile(
  mergeSections: MarkdownSection[],
  conflicts: MigrationConflict[]
): MigrationKind {
  if (conflicts.length > 0) {
    return 'conflict';
  }
  if (mergeSections.length > 0) {
    return 'merge';
  }
  return 'skip duplicate';
}

function summarize(items: MigrationItem[]): MigrationSummary {
  return {
    creates: items.filter((item) => item.kind === 'create').length,
    merges: items.filter((item) => item.kind === 'merge').length,
    conflicts: items.filter((item) => item.kind === 'conflict').length,
    duplicates: items.filter((item) => item.kind === 'skip duplicate').length,
  };
}

function mergeMarkdown(
  destinationContent: string,
  sourceContent: string,
  mergeSections: MarkdownSection[],
  sourceProjectRoot: string,
  home: string
): string {
  const destination = parseMarkdown(destinationContent);
  const source = parseMarkdown(sourceContent);
  const sectionsToAdd = mergeSections.map((section) => `## ${section.heading}\n\n${section.content.trim()}\n`).join('\n');
  const body = `${destination.bodyWithoutSessions.trimEnd()}\n\n${sectionsToAdd}`;
  return appendSessions(
    body,
    uniqueBullets([
      ...destination.sessions,
      ...source.sessions,
      formatMigrationBullet(sourceProjectRoot, home),
    ])
  );
}

function addMigrationProvenance(
  markdown: string,
  sourceProjectRoot: string,
  home: string
): string {
  return appendUniqueSessionBullet(
    ensureTrailingNewline(markdown),
    formatMigrationBullet(sourceProjectRoot, home)
  );
}

function appendSessions(body: string, bullets: string[]): string {
  const normalizedBody = body.trimEnd();
  if (bullets.length === 0) {
    return `${normalizedBody}\n`;
  }
  return `${normalizedBody}\n\n---\n\n## sessions\n\n${bullets.join('\n')}\n`;
}

function uniqueBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const bullet of bullets) {
    const key = bulletDedupeKey(bullet);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(bullet);
  }
  return unique;
}

function bulletDedupeKey(bullet: string): string {
  const match = /^- (?<identity>.+) @ `(?<path>[^`]+)`$/.exec(bullet);
  const sessionId = match?.groups?.identity.match(/^\S+/u)?.[0];
  const path = match?.groups?.path;
  if (sessionId && path) {
    return `${sessionId}@${path}`;
  }
  return bullet;
}

function stripTrailingSessionsSeparator(markdown: string): string {
  return markdown.replace(/\n*---\n\n$/u, '\n');
}

function ensureTrailingNewline(markdown: string): string {
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`;
}

async function writeConflictSidecars(plan: MigrationPlan, conflictDir: string): Promise<void> {
  await mkdir(conflictDir, { recursive: true });
  let index = 1;
  for (const item of plan.items) {
    for (const conflict of item.conflicts) {
      await writeFile(
        join(conflictDir, `conflict-${index}.md`),
        renderConflictSidecar(item, conflict),
        { encoding: 'utf-8', flag: 'wx' }
      );
      index += 1;
    }
  }
}

function renderConflictSidecar(
  item: MigrationItem,
  conflict: MigrationConflict
): string {
  return `# pi-faq migration conflict\n\n` +
    `destination path: ${item.destinationPath}\n` +
    `source path: ${item.sourcePath}\n` +
    `heading: ${conflict.heading}\n\n` +
    `## destination content\n\n${conflict.destinationContent.trim()}\n\n` +
    `## incoming content\n\n${conflict.incomingContent.trim()}\n`;
}

function timestampForPath(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function isMissingPathError(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error)
  ) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
