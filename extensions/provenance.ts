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
  home: string
): string {
  const identity = session.name ? `${session.id} (${session.name})` : session.id;
  if (!sourcePath) {
    return `- ${identity}`;
  }

  return `- ${identity} @ \`${homeRelativePath(sourcePath, home)}\``;
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

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function appendUniqueSessionBullet(markdown: string, bullet: string): string {
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

function parsePathBullet(
  bullet: string
): { sessionId: string; path: string } | undefined {
  const match = /^- (?<identity>.+) @ `(?<path>[^`]+)`(?: \(source modified: \d{4}-\d{2}-\d{2}\))?$/.exec(bullet);
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
  };
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
