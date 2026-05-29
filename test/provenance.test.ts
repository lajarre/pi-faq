import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  appendUniqueSessionBullet,
  findUndatedSessionBullets,
  findProjectRoot,
  formatMigrationBullet,
  formatSessionBullet,
  homeRelativePath,
} from '../extensions/provenance.ts';
import { validateKnowledgeBaseProvenance } from '../script/validate-provenance.ts';

const home = '/Users/example';
const session = {
  id: '6eb88af6-507d-445a-b590-25dcf266d175',
  name: 'my-session',
};
const captureDate = '2026-05-29';

describe('home-relative provenance paths', () => {
  it('formats paths under HOME with a leading tilde', () => {
    assert.equal(
      homeRelativePath('/Users/example/workspace/repo', home),
      '~/workspace/repo'
    );
  });

  it('formats HOME children whose first segment starts with dot-dot', () => {
    assert.equal(
      homeRelativePath('/Users/example/..workspace/repo', home),
      '~/..workspace/repo'
    );
  });

  it('leaves paths outside HOME absolute', () => {
    assert.equal(
      homeRelativePath('/opt/project', home),
      '/opt/project'
    );
  });
});

describe('project root detection', () => {
  it('returns the nearest ancestor containing .git', () => {
    const projectRoot = '/Users/example/workspace/repo';
    const cwd = join(projectRoot, 'packages', 'app');

    const root = findProjectRoot(cwd, (path) => path === join(projectRoot, '.git'));

    assert.equal(root, projectRoot);
  });

  it('returns the session cwd when no project marker exists', () => {
    const cwd = '/Users/example/workspace/repo/packages/app';

    assert.equal(findProjectRoot(cwd, () => false), cwd);
  });
});

describe('provenance bullet formatting', () => {
  it('formats session identity with source path provenance', () => {
    assert.equal(
      formatSessionBullet(session, '/Users/example/workspace/repo', home, captureDate),
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo` @ 2026-05-29'
    );
  });

  it('preserves session identity and date without inventing a source path', () => {
    assert.equal(
      formatSessionBullet(session, undefined, home, captureDate),
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ 2026-05-29'
    );
    assert.equal(
      formatSessionBullet(session, undefined, home, captureDate).includes('`'),
      false,
    );
  });

  it('formats migration provenance with a home-relative source root', () => {
    assert.equal(
      formatMigrationBullet(
        '/Users/example/workspace/repo',
        home,
        new Date('2026-05-28T10:54:57Z')
      ),
      '- migrated from local docs @ `~/workspace/repo` (source modified: 2026-05-28)'
    );
  });
});

describe('session block updates', () => {
  it('appends a new bullet to an existing sessions block', () => {
    const markdown = '# note\n\n---\n\n## sessions\n\n- existing-session\n';
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home, captureDate);

    assert.equal(
      appendUniqueSessionBullet(markdown, bullet),
      '# note\n\n---\n\n## sessions\n\n- existing-session\n' +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo` @ 2026-05-29\n'
    );
  });

  it('does not add the same session/path pair twice', () => {
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home, captureDate);
    const markdown = `# note\n\n---\n\n## sessions\n\n${bullet}\n`;

    assert.equal(appendUniqueSessionBullet(markdown, bullet), markdown);
  });

  it('keeps the first capture date for an already dated session/path pair', () => {
    const existing = formatSessionBullet(
      session,
      '/Users/example/workspace/repo',
      home,
      '2026-05-28'
    );
    const incoming = formatSessionBullet(
      session,
      '/Users/example/workspace/repo',
      home,
      '2026-05-29'
    );
    const markdown = `# note\n\n---\n\n## sessions\n\n${existing}\n`;

    assert.equal(appendUniqueSessionBullet(markdown, incoming), markdown);
  });

  it('dedupes session/path pairs when display names differ or are absent', () => {
    const path = '/Users/example/workspace/repo';
    const renamedSession = { ...session, name: 'renamed-session' };
    const unnamedSession = { id: session.id };
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      `${formatSessionBullet(renamedSession, path, home, captureDate)}\n`;

    assert.equal(
      appendUniqueSessionBullet(
        markdown,
        formatSessionBullet(unnamedSession, path, home, captureDate)
      ),
      markdown
    );
  });

  it('upgrades existing session/path bullets with a capture date', () => {
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo`\n';
    const bullet = formatSessionBullet(
      session,
      '/Users/example/workspace/repo',
      home,
      captureDate
    );

    assert.equal(
      appendUniqueSessionBullet(markdown, bullet),
      '# note\n\n---\n\n## sessions\n\n' +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo` @ 2026-05-29\n'
    );
  });

  it('upgrades existing pathless bullets with a capture date', () => {
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)\n';
    const bullet = formatSessionBullet(session, undefined, home, captureDate);

    assert.equal(
      appendUniqueSessionBullet(markdown, bullet),
      '# note\n\n---\n\n## sessions\n\n' +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ 2026-05-29\n'
    );
  });

  it('preserves existing session bullets without paths', () => {
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)\n';
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home, captureDate);

    assert.equal(
      appendUniqueSessionBullet(markdown, bullet),
      markdown +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo` @ 2026-05-29\n'
    );
  });

  it('creates a sessions block when one is missing', () => {
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home, captureDate);

    assert.equal(
      appendUniqueSessionBullet('# note\n\nbody\n', bullet),
      '# note\n\nbody\n\n---\n\n## sessions\n\n' +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo` @ 2026-05-29\n'
    );
  });
});

describe('provenance validation', () => {
  it('flags session bullets without capture dates', () => {
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      '- 6eb88af6-507d-445a-b590-25dcf266d175 @ `~/workspace/repo`\n' +
      '- 9a21... (retro import)\n' +
      '- migrated from local docs @ `~/workspace/repo` (source modified: 2026-05-28)\n' +
      '- migrated from local docs @ `~/workspace/legacy`\n' +
      '- dated-session @ `~/workspace/repo` @ 2026-05-29\n' +
      '- pathless-dated @ 2026-05-29\n';

    assert.deepEqual(
      findUndatedSessionBullets(markdown),
      [
        {
          line: 7,
          bullet: '- 6eb88af6-507d-445a-b590-25dcf266d175 @ `~/workspace/repo`',
        },
        {
          line: 8,
          bullet: '- 9a21... (retro import)',
        },
      ]
    );
  });

  it('scans faq and ref markdown files for undated session bullets', async () => {
    const knowledgeBase = await mkdtemp(join(tmpdir(), 'pi-faq-kb-'));
    await mkdir(join(knowledgeBase, 'faq'));
    await mkdir(join(knowledgeBase, 'ref'));
    await writeFile(
      join(knowledgeBase, 'faq', 'dated.md'),
      '# dated\n\n---\n\n## sessions\n\n- session-a @ `~/repo` @ 2026-05-29\n'
    );
    await writeFile(
      join(knowledgeBase, 'ref', 'undated.md'),
      '# undated\n\n---\n\n## sessions\n\n- session-b @ `~/repo`\n'
    );

    assert.deepEqual(
      await validateKnowledgeBaseProvenance(knowledgeBase),
      [{
        path: join(knowledgeBase, 'ref', 'undated.md'),
        line: 7,
        bullet: '- session-b @ `~/repo`',
      }]
    );
  });
});
