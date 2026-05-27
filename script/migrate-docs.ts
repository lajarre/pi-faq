import { pathToFileURL } from 'node:url';

export interface MigrationArgs {
  help: boolean;
  apply: boolean;
  writeConflicts: boolean;
  conflictDir?: string;
}

export function parseMigrationArgs(argv: string[]): MigrationArgs {
  const args: MigrationArgs = {
    help: false,
    apply: false,
    writeConflicts: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
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
      if (conflictDir !== undefined) {
        args.conflictDir = conflictDir;
        index += 1;
      }
    }
  }

  return args;
}

export function renderHelp(): string {
  return `pi-faq docs migration

Usage:
  npm run migrate -- [--apply] [--write-conflicts] [--conflict-dir <path>]

Dry-run is the default. Without --apply, the command prints the migration plan and writes nothing.

Options:
  --help             Show this help.
  --apply            Apply the planned migration instead of only showing it.
  --write-conflicts  With --apply, write conflict sidecars for review.
  --conflict-dir     Directory for conflict sidecar files.
`;
}

export async function main(
  argv = process.argv.slice(2)
): Promise<number> {
  const args = parseMigrationArgs(argv);

  if (args.help) {
    console.log(renderHelp());
    return 0;
  }

  console.error('pi-faq docs migration is not implemented yet.');
  return 1;
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
