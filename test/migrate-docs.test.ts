import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import {
  main,
  parseMigrationArgs,
  renderHelp,
} from '../script/migrate-docs.ts';
import {
  applyMigrationPlan,
  createMigrationPlan,
  renderMigrationPlan,
  scanLocalDocs,
} from '../script/migration.ts';

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pi-faq-migrate-'));
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

async function setModifiedDate(path: string, iso: string): Promise<void> {
  const date = new Date(iso);
  await utimes(path, date, date);
}

async function configureKnowledgeBase(home: string, knowledgeBase: string): Promise<void> {
  await writeText(
    join(home, '.pi', 'agent', 'config', 'pi-faq.json'),
    JSON.stringify({ knowledgeBase })
  );
}

function capture(): {
  stdout: string[];
  stderr: string[];
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writeOut: (text) => stdout.push(text),
    writeErr: (text) => stderr.push(text),
  };
}

function markdown(body: string, sessions = '- existing-session @ `~/workspace/repo`\n'): string {
  return `${body.trimEnd()}\n\n---\n\n## sessions\n\n${sessions}`;
}

describe('migration CLI parsing and help', () => {
  it('documents dry-run default and supported flags for --help and -h', async () => {
    const home = await tempHome();
    const output = capture();

    assert.equal(parseMigrationArgs(['--help']).help, true);
    assert.equal(parseMigrationArgs(['-h']).help, true);
    assert.match(renderHelp(), /Dry-run is the default/);
    assert.match(renderHelp(), /--apply/);
    assert.match(renderHelp(), /--write-conflicts/);
    assert.match(renderHelp(), /--conflict-dir <path>/);

    const code = await main(['-h'], {
      home,
      stdout: output.writeOut,
      stderr: output.writeErr,
    });

    assert.equal(code, 0);
    assert.match(output.stdout.join('\n'), /Dry-run is the default/);
    assert.equal(output.stderr.join(''), '');
  });

  it('rejects unknown flags and missing --conflict-dir values', async () => {
    const home = await tempHome();
    const unknown = capture();
    const missing = capture();

    assert.equal(await main(['--wat'], {
      home,
      stdout: unknown.writeOut,
      stderr: unknown.writeErr,
    }), 1);
    assert.match(unknown.stderr.join('\n'), /unknown option: --wat/);

    assert.equal(await main(['--conflict-dir'], {
      home,
      stdout: missing.writeOut,
      stderr: missing.writeErr,
    }), 1);
    assert.match(missing.stderr.join('\n'), /--conflict-dir requires a value/);
  });

  it('loads mandatory config in non-help mode and reports fatal errors clearly', async () => {
    const home = await tempHome();
    const output = capture();

    const code = await main([], {
      home,
      stdout: output.writeOut,
      stderr: output.writeErr,
    });

    assert.equal(code, 1);
    assert.match(output.stderr.join('\n'), /fatal: pi-faq config missing/);
    assert.equal(output.stdout.join(''), '');
  });
});

describe('migration scanning and dry-run planning', () => {
  it('scans only ~/workspace and ~/p to project depth 5 for direct faq/ref markdown files', async () => {
    const home = await tempHome();
    const includedFaq = join(home, 'workspace', 'one', 'doc', 'faq', 'a.md');
    const includedRef = join(home, 'p', 'one', 'two', 'three', 'four', 'five', 'doc', 'ref', 'b.md');
    const tooDeep = join(home, 'workspace', 'one', 'two', 'three', 'four', 'five', 'six', 'doc', 'faq', 'deep.md');
    const nested = join(home, 'workspace', 'one', 'doc', 'faq', 'nested', 'skip.md');
    const nonMarkdown = join(home, 'workspace', 'one', 'doc', 'ref', 'skip.txt');
    const otherRoot = join(home, 'elsewhere', 'repo', 'doc', 'faq', 'skip.md');

    for (const path of [includedFaq, includedRef, tooDeep, nested, nonMarkdown, otherRoot]) {
      await writeText(path, '# doc\n');
    }

    const files = await scanLocalDocs({ home });

    assert.deepEqual(
      files.map((file) => file.sourcePath).sort(),
      [includedFaq, includedRef].sort()
    );
    assert.equal(files.find((file) => file.sourcePath === includedFaq)?.kind, 'faq');
    assert.equal(files.find((file) => file.sourcePath === includedRef)?.kind, 'ref');
    assert.equal(
      files.find((file) => file.sourcePath === includedFaq)?.sourceProjectRoot,
      join(home, 'workspace', 'one')
    );
  });

  it('fails instead of silently skipping unusable doc directories', async () => {
    const home = await tempHome();
    const blockedFaq = join(home, 'workspace', 'repo', 'doc', 'faq');
    await writeText(blockedFaq, 'not a directory');

    await assert.rejects(
      scanLocalDocs({ home }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /failed to scan local docs directory/);
        assert.match(error.message, /doc\/faq/);
        return true;
      }
    );
  });

  it('plans creates and renders summary counts for all classes', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const source = join(home, 'workspace', 'repo', 'doc', 'faq', 'new.md');
    await writeText(source, '# new\n\n## answer\n\nCreate me.\n');

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });
    const output = renderMigrationPlan(plan);

    assert.equal(plan.summary.creates, 1);
    assert.equal(plan.summary.merges, 0);
    assert.equal(plan.summary.conflicts, 0);
    assert.equal(plan.summary.duplicates, 0);
    assert.match(output, /create:/);
    assert.match(output, /creates: 1/);
    assert.match(output, /merges: 0/);
    assert.match(output, /conflicts: 0/);
    assert.match(output, /skip duplicates: 0/);
  });

  it('dry-run is the default and writes nothing', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    await configureKnowledgeBase(home, knowledgeBase);
    await writeText(
      join(home, 'workspace', 'repo', 'doc', 'ref', 'new.md'),
      '# new\n\n## answer\n\nCreate me.\n'
    );
    const output = capture();

    const code = await main([], {
      home,
      stdout: output.writeOut,
      stderr: output.writeErr,
    });

    assert.equal(code, 0);
    assert.match(output.stdout.join('\n'), /dry-run/);
    assert.equal(existsSync(join(knowledgeBase, 'ref', 'new.md')), false);
  });
});

describe('migration apply, merges, duplicates, and conflicts', () => {
  it('applies creates with migrated provenance and leaves source files unchanged', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const source = join(home, 'workspace', 'repo', 'doc', 'faq', 'create.md');
    const sourceContent = markdown('# create\n\n## answer\n\nCreated content.\n');
    await writeText(source, sourceContent);
    await setModifiedDate(source, '2025-01-02T03:04:05Z');

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });
    await applyMigrationPlan(plan, { home, apply: true, writeConflicts: false });

    const destination = await readFile(join(knowledgeBase, 'faq', 'create.md'), 'utf-8');
    assert.match(destination, /## answer\n\nCreated content\./);
    assert.match(destination, /- existing-session @ `~\/workspace\/repo`/);
    assert.match(
      destination,
      /- migrated from local docs @ `~\/workspace\/repo` \(source modified: 2025-01-02\)/
    );
    assert.equal(await readFile(source, 'utf-8'), sourceContent);
  });

  it('plans same-destination creates as one create plus merge and preserves both sources', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const workspaceSource = join(home, 'workspace', 'repo-a', 'doc', 'faq', 'same.md');
    const pSource = join(home, 'p', 'repo-b', 'doc', 'faq', 'same.md');
    const destination = join(knowledgeBase, 'faq', 'same.md');
    const workspaceContent = markdown('# workspace\n\n## workspace answer\n\nWorkspace content.\n');
    const pContent = markdown(
      '# p\n\n## p answer\n\nP content.\n',
      '- p-session @ `~/p/repo-b`\n'
    );
    await writeText(workspaceSource, workspaceContent);
    await writeText(pSource, pContent);

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });
    const dryRun = renderMigrationPlan(plan);
    const destinationCreates = plan.items.filter(
      (item) => item.destinationPath === destination && item.kind === 'create'
    );
    const dryRunCreates = dryRun.split('\n').filter(
      (line) => line.startsWith('create:') && line.endsWith(destination)
    );

    assert.equal(existsSync(destination), false);
    assert.equal(destinationCreates.length, 1);
    assert.equal(dryRunCreates.length, 1);
    assert.equal(plan.summary.creates, 1);
    assert.equal(plan.summary.merges, 1);

    await applyMigrationPlan(plan, { home, apply: true, writeConflicts: false });

    const migrated = await readFile(destination, 'utf-8');
    assert.match(migrated, /## workspace answer\n\nWorkspace content\./);
    assert.match(migrated, /## p answer\n\nP content\./);
    assert.match(migrated, /- migrated from local docs @ `~\/workspace\/repo-a`/);
    assert.match(migrated, /- migrated from local docs @ `~\/p\/repo-b`/);
    assert.equal(await readFile(workspaceSource, 'utf-8'), workspaceContent);
    assert.equal(await readFile(pSource, 'utf-8'), pContent);
  });

  it('does not overwrite a destination that appears after create planning', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const source = join(home, 'workspace', 'repo', 'doc', 'faq', 'stale.md');
    const destination = join(knowledgeBase, 'faq', 'stale.md');
    const staleDestination = '# stale\n\n## answer\n\nExisting content.\n';
    await writeText(source, '# source\n\n## answer\n\nSource content.\n');

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });
    await writeText(destination, staleDestination);

    await assert.rejects(
      applyMigrationPlan(plan, { home, apply: true, writeConflicts: false }),
      /EEXIST|exist/i
    );
    assert.equal(await readFile(destination, 'utf-8'), staleDestination);
  });

  it('applies merges before sessions, preserves unique session bullets, and warns visibly', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const source = join(home, 'workspace', 'repo', 'doc', 'ref', 'merge.md');
    const destination = join(knowledgeBase, 'ref', 'merge.md');
    await writeText(source, markdown(
      '# source\n\n## existing\n\nSame.\n\n## incoming\n\nNew section.\n',
      '- source-session @ `~/workspace/repo`\n- duplicate-session\n'
    ));
    await writeText(destination, markdown(
      '# dest\n\n## existing\n\nSame.\n',
      '- dest-session\n- duplicate-session\n'
    ));

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });
    const dryRun = renderMigrationPlan(plan);
    assert.equal(plan.summary.merges, 1);
    assert.match(dryRun, /merges will happen/);

    await applyMigrationPlan(plan, { home, apply: true, writeConflicts: false });

    const merged = await readFile(destination, 'utf-8');
    assert.match(merged, /## incoming\n\nNew section\.\n\n---\n\n## sessions/);
    assert.equal((merged.match(/- duplicate-session/g) ?? []).length, 1);
    assert.match(merged, /- dest-session/);
    assert.match(merged, /- source-session @ `~\/workspace\/repo`/);
    assert.match(merged, /- migrated from local docs @ `~\/workspace\/repo`/);
  });

  it('skips duplicate-only files without writing migrated provenance', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const source = join(home, 'workspace', 'repo', 'doc', 'faq', 'dupe.md');
    const destination = join(knowledgeBase, 'faq', 'dupe.md');
    const destContent = markdown('# dest\n\n## same\n\nSame content.\n');
    await writeText(source, markdown('# source\n\n## same\n\nSame content.\n'));
    await writeText(destination, destContent);
    const before = await stat(destination);

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });
    await applyMigrationPlan(plan, { home, apply: true, writeConflicts: false });

    assert.equal(plan.summary.duplicates, 1);
    assert.equal(await readFile(destination, 'utf-8'), destContent);
    assert.equal((await stat(destination)).mtimeMs, before.mtimeMs);
    assert.doesNotMatch(destContent, /migrated from local docs/);
  });

  it('classifies conflicts and refuses apply without conflict sidecar permission', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const source = join(home, 'workspace', 'repo', 'doc', 'ref', 'conflict.md');
    const destination = join(knowledgeBase, 'ref', 'conflict.md');
    const destContent = markdown('# dest\n\n## same\n\nDestination content.\n');
    await writeText(source, markdown('# source\n\n## same\n\nIncoming content.\n'));
    await writeText(destination, destContent);

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });

    assert.equal(plan.summary.conflicts, 1);
    await assert.rejects(
      applyMigrationPlan(plan, { home, apply: true, writeConflicts: false }),
      /refusing to apply migration with conflicts/
    );
    assert.equal(await readFile(destination, 'utf-8'), destContent);
  });

  it('prepares conflict sidecars before mutating destinations', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const conflictDir = join(home, 'review');
    const conflictSource = join(home, 'workspace', 'repo', 'doc', 'ref', 'conflict.md');
    const createSource = join(home, 'workspace', 'repo', 'doc', 'ref', 'create.md');
    const conflictDestination = join(knowledgeBase, 'ref', 'conflict.md');
    const createDestination = join(knowledgeBase, 'ref', 'create.md');
    const conflictDestinationContent = markdown('# dest\n\n## same\n\nDestination content.\n');
    const existingSidecar = join(conflictDir, 'conflict-1.md');
    await writeText(conflictSource, markdown('# source\n\n## same\n\nIncoming content.\n'));
    await writeText(createSource, '# create\n\n## answer\n\nCreate content.\n');
    await writeText(conflictDestination, conflictDestinationContent);
    await writeText(existingSidecar, 'previous review artifact');

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: await scanLocalDocs({ home }),
    });

    assert.equal(plan.summary.conflicts, 1);
    assert.equal(plan.summary.creates, 1);
    await assert.rejects(
      applyMigrationPlan(plan, {
        home,
        apply: true,
        writeConflicts: true,
        conflictDir,
      }),
      /EEXIST|exist/i
    );
    assert.equal(await readFile(conflictDestination, 'utf-8'), conflictDestinationContent);
    assert.equal(existsSync(createDestination), false);
    assert.equal(await readFile(existingSidecar, 'utf-8'), 'previous review artifact');
  });

  it('writes reviewable conflict sidecars to the default or custom conflict directory', async () => {
    const home = await tempHome();
    const knowledgeBase = join(home, 'kb');
    const customConflictDir = join(home, 'review');
    const defaultSource = join(home, 'workspace', 'repo-a', 'doc', 'faq', 'conflict.md');
    const customSource = join(home, 'p', 'repo-b', 'doc', 'faq', 'conflict.md');
    const destination = join(knowledgeBase, 'faq', 'conflict.md');
    await writeText(defaultSource, markdown('# source\n\n## same\n\nIncoming A.\n'));
    await writeText(customSource, markdown('# source\n\n## same\n\nIncoming B.\n'));
    await writeText(destination, markdown('# dest\n\n## same\n\nDestination content.\n'));

    const plan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: (await scanLocalDocs({ home })).filter((file) => file.sourcePath === defaultSource),
    });
    await applyMigrationPlan(plan, {
      home,
      apply: true,
      writeConflicts: true,
      now: new Date('2026-05-27T12:00:00Z'),
    });
    const defaultSidecar = join(
      knowledgeBase,
      '.pi-faq-conflicts',
      '2026-05-27T12-00-00-000Z',
      'conflict-1.md'
    );
    const defaultContent = await readFile(defaultSidecar, 'utf-8');
    assert.match(defaultContent, /destination path:/);
    assert.match(defaultContent, /source path:/);
    assert.match(defaultContent, /heading: same/);
    assert.match(defaultContent, /Destination content\./);
    assert.match(defaultContent, /Incoming A\./);

    const customPlan = await createMigrationPlan({
      home,
      knowledgeBase,
      sources: (await scanLocalDocs({ home })).filter((file) => file.sourcePath === customSource),
    });
    await applyMigrationPlan(customPlan, {
      home,
      apply: true,
      writeConflicts: true,
      conflictDir: customConflictDir,
      now: new Date('2026-05-27T12:00:00Z'),
    });

    assert.equal(existsSync(join(customConflictDir, 'conflict-1.md')), true);
  });
});
