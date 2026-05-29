import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadKnowledgeConfig,
  resolveKnowledgeBase,
} from '../extensions/area.ts';
import { findUndatedSessionBullets } from '../extensions/provenance.ts';

export interface ProvenanceValidationIssue {
  path: string;
  line: number;
  bullet: string;
}

export interface ProvenanceValidationMainOptions {
  home?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export async function validateKnowledgeBaseProvenance(
  knowledgeBase: string
): Promise<ProvenanceValidationIssue[]> {
  const markdownFiles = await listMarkdownFiles([
    join(knowledgeBase, 'faq'),
    join(knowledgeBase, 'ref'),
  ]);
  const issues: ProvenanceValidationIssue[] = [];

  for (const path of markdownFiles) {
    const markdown = await readFile(path, 'utf-8');
    for (const issue of findUndatedSessionBullets(markdown)) {
      issues.push({
        path,
        line: issue.line,
        bullet: issue.bullet,
      });
    }
  }

  return issues;
}

export async function main(
  _argv = process.argv.slice(2),
  options: ProvenanceValidationMainOptions = {}
): Promise<number> {
  const stdout = options.stdout ?? ((text: string) => console.log(text.trimEnd()));
  const stderr = options.stderr ?? ((text: string) => console.error(text.trimEnd()));
  const home = options.home ?? process.env.HOME ?? '';
  const config = loadKnowledgeConfig({ home });
  if (!config.ok) {
    stderr(`fatal: ${config.error}\n`);
    return 1;
  }

  const resolution = resolveKnowledgeBase(config.value, { home });
  if (!resolution.ok) {
    stderr(`fatal: ${resolution.error}\n`);
    return 1;
  }

  try {
    const issues = await validateKnowledgeBaseProvenance(
      resolution.value.knowledgeBase
    );

    if (issues.length === 0) {
      stdout('pi-faq provenance validation passed\n');
      return 0;
    }

    const lines = [
      'pi-faq provenance validation failed',
      '',
      ...issues.map((issue) => {
        const displayPath = relative(resolution.value.knowledgeBase, issue.path);
        return `${displayPath}:${issue.line}: missing capture date\n  ${issue.bullet}`;
      }),
      '',
      'Expected session bullets like:',
      '- <session> @ `~/repo` @ YYYY-MM-DD',
      '- <session> @ YYYY-MM-DD',
    ];
    stderr(`${lines.join('\n')}\n`);
    return 1;
  } catch (error) {
    stderr(`fatal: ${messageFromError(error)}\n`);
    return 1;
  }
}

async function listMarkdownFiles(roots: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) {
    await collectMarkdownFiles(root, files);
  }
  return files.sort();
}

async function collectMarkdownFiles(root: string, files: string[]): Promise<void> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(path, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path);
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isDirectRun = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
