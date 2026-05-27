import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export function homeRelativePath(path: string, home: string): string {
  const absolutePath = resolve(path);
  const absoluteHome = resolve(home);
  const relativeToHome = relative(absoluteHome, absolutePath);

  if (relativeToHome === '') {
    return '~';
  }

  if (!relativeToHome.startsWith('..') && !isAbsolute(relativeToHome)) {
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
  home: string
): string {
  return `- migrated from local docs @ \`${homeRelativePath(sourceProjectRoot, home)}\``;
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
      existingParts.identity === newBulletParts.identity &&
      existingParts.path === newBulletParts.path
    ) {
      return true;
    }
  }

  return false;
}

function parsePathBullet(
  bullet: string
): { identity: string; path: string } | undefined {
  const match = /^- (?<identity>.+) @ `(?<path>[^`]+)`$/.exec(bullet);
  if (!match?.groups) {
    return undefined;
  }

  return {
    identity: match.groups.identity,
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
