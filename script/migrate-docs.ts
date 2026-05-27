import { pathToFileURL } from 'node:url';

import {
  loadKnowledgeConfig,
  resolveKnowledgeBase,
} from '../extensions/area.ts';
import {
  applyMigrationPlan,
  createMigrationPlan,
  renderMigrationPlan,
  scanLocalDocs,
} from './migration.ts';

export interface MigrationArgs {
  help: boolean;
  apply: boolean;
  writeConflicts: boolean;
  conflictDir?: string;
}

export interface MigrationMainOptions {
  home?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  now?: Date;
}

export function parseMigrationArgs(argv: string[]): MigrationArgs {
  const args: MigrationArgs = {
    help: false,
    apply: false,
    writeConflicts: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--apply') {
      args.apply = true;
      continue;
    }

    if (arg === '--write-conflicts') {
      args.writeConflicts = true;
      continue;
    }

    if (arg === '--conflict-dir') {
      const conflictDir = argv[index + 1];
      if (conflictDir === undefined || conflictDir.startsWith('-')) {
        throw new Error('--conflict-dir requires a value');
      }
      args.conflictDir = conflictDir;
      index += 1;
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  return args;
}

export function renderHelp(): string {
  return `pi-faq docs migration

Usage:
  npm run migrate -- [--apply] [--write-conflicts] [--conflict-dir <path>]

Dry-run is the default. Without --apply, the command prints the migration plan and writes nothing.

Options:
  -h, --help                 Show this help.
  --apply                    Apply the planned migration instead of only showing it.
  --write-conflicts          With --apply, write conflict sidecars for review.
  --conflict-dir <path>      Directory for conflict sidecar files.
`;
}

export async function main(
  argv = process.argv.slice(2),
  options: MigrationMainOptions = {}
): Promise<number> {
  const stdout = options.stdout ?? ((text: string) => console.log(text.trimEnd()));
  const stderr = options.stderr ?? ((text: string) => console.error(text.trimEnd()));
  let args: MigrationArgs;

  try {
    args = parseMigrationArgs(argv);
  } catch (error) {
    stderr(`fatal: ${messageFromError(error)}\n`);
    return 1;
  }

  if (args.help) {
    stdout(renderHelp());
    return 0;
  }

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
    const sources = await scanLocalDocs({ home });
    const plan = await createMigrationPlan({
      home,
      knowledgeBase: resolution.value.knowledgeBase,
      sources,
    });

    if (!args.apply) {
      stdout(renderMigrationPlan(plan));
      return 0;
    }

    await applyMigrationPlan(plan, {
      home,
      apply: true,
      writeConflicts: args.writeConflicts,
      conflictDir: args.conflictDir,
      now: options.now,
    });
    stdout(renderAppliedSummary(plan));
    return 0;
  } catch (error) {
    stderr(`fatal: ${messageFromError(error)}\n`);
    return 1;
  }
}

function renderAppliedSummary(plan: { summary: {
  creates: number;
  merges: number;
  conflicts: number;
  duplicates: number;
} }): string {
  return 'pi-faq docs migration applied\n\n' +
    'summary:\n' +
    `  creates: ${plan.summary.creates}\n` +
    `  merges: ${plan.summary.merges}\n` +
    `  conflicts: ${plan.summary.conflicts}\n` +
    `  skip duplicates: ${plan.summary.duplicates}\n`;
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
