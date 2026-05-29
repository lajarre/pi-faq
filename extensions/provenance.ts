import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export interface ProvenanceContext {
  cwd?: string;
  workingDirectory?: string;
  workspace?: {
    cwd?: string;
    root?: string;
  };
  session?: {
    cwd?: string;
    workingDirectory?: string;
  };
}

export interface SourcePathOptions {
  home: string;
  exists: (path: string) => boolean;
}

export function homeRelativePath(path: string, home: string): string {
  const absolutePath = resolve(path);
  const absoluteHome = resolve(home);
  const relativeToHome = relative(absoluteHome, absolutePath);

  if (relativeToHome === '') {
    return '~';
  }

  if (
    relativeToHome !== '..' &&
    !relativeToHome.startsWith('../') &&
    !isAbsolute(relativeToHome)
  ) {
    return `~/${relativeToHome}`;
  }

  return absolutePath;
}

export function findProjectRoot(
  cwd: string,
  exists: (path: string) => boolean
): string {
  let current = resolve(cwd);

  while (true) {
    if (exists(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return cwd;
    }
    current = parent;
  }
}

export function getContextCwd(
  ctx: ProvenanceContext
): string | undefined {
  return ctx.cwd ??
    ctx.workingDirectory ??
    ctx.workspace?.cwd ??
    ctx.workspace?.root ??
    ctx.session?.cwd ??
    ctx.session?.workingDirectory;
}

export function sourcePathFromContext(
  ctx: ProvenanceContext,
  options: SourcePathOptions
): string | undefined {
  const cwd = getContextCwd(ctx);
  if (!cwd) {
    return undefined;
  }

  const projectRoot = findProjectRoot(cwd, options.exists);
  return options.home ? homeRelativePath(projectRoot, options.home) : projectRoot;
}

export function formatSessionBullet(
  session: { id: string; name?: string },
  sourcePath: string | undefined,
  home: string,
  capturedAt: Date | string
): string {
  const identity = session.name ? `${session.id} (${session.name})` : session.id;
  const capturedDate = dateOnly(capturedAt);
  if (!sourcePath) {
    return `- ${identity} @ ${capturedDate}`;
  }

  return `- ${identity} @ \`${homeRelativePath(sourcePath, home)}\` @ ${capturedDate}`;
}

export function formatMigrationBullet(
  sourceProjectRoot: string,
  home: string,
  sourceModifiedAt?: Date
): string {
  const path = homeRelativePath(sourceProjectRoot, home);
  const modified = sourceModifiedAt
    ? ` (source modified: ${dateOnly(sourceModifiedAt)})`
    : '';
  return `- migrated from local docs @ \`${path}\`${modified}`;
}

function dateOnly(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const parsed = typeof date === 'string' ? new Date(date) : date;
  return parsed.toISOString().slice(0, 10);
}

export function appendUniqueSessionBullet(markdown: string, bullet: string): string {
  const upgraded = replaceUndatedMatchingBullet(markdown, bullet);
  if (upgraded !== markdown) {
    return upgraded;
  }

  if (hasDuplicateSessionBullet(markdown, bullet)) {
    return markdown;
  }

  const sessionsHeading = findSessionsHeading(markdown);
  if (!sessionsHeading) {
    return appendNewSessionsBlock(markdown, bullet);
  }

  const insertAt = findSessionsBlockEnd(markdown, sessionsHeading.contentStart);
  const prefix = markdown.slice(0, insertAt);
  const suffix = markdown.slice(insertAt);
  const separator = prefix.endsWith('\n') ? '' : '\n';

  return `${prefix}${separator}${bullet}\n${suffix}`;
}

function hasDuplicateSessionBullet(markdown: string, bullet: string): boolean {
  if (markdown.split('\n').includes(bullet)) {
    return true;
  }

  const newBulletParts = parsePathBullet(bullet);
  if (!newBulletParts) {
    return false;
  }

  for (const line of markdown.split('\n')) {
    const existingParts = parsePathBullet(line);
    if (
      existingParts &&
      existingParts.sessionId === newBulletParts.sessionId &&
      existingParts.path === newBulletParts.path
    ) {
      return true;
    }
  }

  return false;
}

function replaceUndatedMatchingBullet(markdown: string, bullet: string): string {
  const newBulletParts = parsePathBullet(bullet);
  if (!newBulletParts?.captureDate) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const replaceIndex = lines.findIndex((line) => {
    const existingParts = parsePathBullet(line);
    return existingParts !== undefined &&
      existingParts.sessionId === newBulletParts.sessionId &&
      existingParts.path === newBulletParts.path &&
      existingParts.captureDate === undefined;
  });

  if (replaceIndex === -1) {
    return markdown;
  }

  lines[replaceIndex] = bullet;
  return lines.join('\n');
}

export interface UndatedSessionBulletIssue {
  line: number;
  bullet: string;
}

export function findUndatedSessionBullets(
  markdown: string
): UndatedSessionBulletIssue[] {
  const sessionsHeading = findSessionsHeading(markdown);
  if (!sessionsHeading) {
    return [];
  }

  const sessionsEnd = findSessionsBlockEnd(markdown, sessionsHeading.contentStart);
  const prefixLineCount = markdown.slice(0, sessionsHeading.contentStart)
    .split('\n').length - 1;
  const lines = markdown.slice(sessionsHeading.contentStart, sessionsEnd).split('\n');
  const issues: UndatedSessionBulletIssue[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trimEnd() ?? '';
    if (!line.startsWith('- ')) {
      continue;
    }
    if (isMigrationBullet(line)) {
      continue;
    }

    const parts = parsePathBullet(line);
    if (!parts?.captureDate) {
      issues.push({
        line: prefixLineCount + index + 1,
        bullet: line,
      });
    }
  }

  return issues;
}

function parsePathBullet(
  bullet: string
): { sessionId: string; path?: string; captureDate?: string } | undefined {
  const pathMatch = /^- (?<identity>.+) @ `(?<path>[^`]+)`(?: @ (?<captureDate>\d{4}-\d{2}-\d{2}))?(?: \(source modified: \d{4}-\d{2}-\d{2}\))?$/.exec(bullet);
  const pathlessDatedMatch = /^- (?<identity>.+) @ (?<captureDate>\d{4}-\d{2}-\d{2})$/.exec(bullet);
  const legacyPathlessMatch = /^- (?<identity>.+)$/.exec(bullet);
  const match = pathMatch ?? pathlessDatedMatch ?? legacyPathlessMatch;

  if (!match?.groups) {
    return undefined;
  }

  const sessionId = /^\S+/.exec(match.groups.identity)?.[0];
  if (!sessionId) {
    return undefined;
  }

  return {
    sessionId,
    path: match.groups.path,
    captureDate: match.groups.captureDate,
  };
}

function isMigrationBullet(line: string): boolean {
  return /^- migrated from local docs @ `[^`]+`(?: \(source modified: \d{4}-\d{2}-\d{2}\))?$/.test(line);
}

function findSessionsHeading(
  markdown: string
): { index: number; contentStart: number } | undefined {
  const match = /^## sessions[ \t]*$/m.exec(markdown);
  if (!match?.index && match?.index !== 0) {
    return undefined;
  }

  return {
    index: match.index,
    contentStart: match.index + match[0].length,
  };
}

function findSessionsBlockEnd(markdown: string, contentStart: number): number {
  const nextHeading = markdown.slice(contentStart).match(/^## /m);
  if (nextHeading?.index === undefined) {
    return markdown.length;
  }

  return contentStart + nextHeading.index;
}

function appendNewSessionsBlock(markdown: string, bullet: string): string {
  const prefix = markdown.trimEnd();
  const leading = prefix.length > 0 ? `${prefix}\n\n` : '';

  return `${leading}---\n\n## sessions\n\n${bullet}\n`;
}
