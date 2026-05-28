import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  appendUniqueSessionBullet,
  findProjectRoot,
  formatMigrationBullet,
  formatSessionBullet,
  homeRelativePath,
} from '../extensions/provenance.ts';

const home = '/Users/example';
const session = {
  id: '6eb88af6-507d-445a-b590-25dcf266d175',
  name: 'my-session',
};

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
      formatSessionBullet(session, '/Users/example/workspace/repo', home),
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo`'
    );
  });

  it('preserves session identity without inventing a source path', () => {
    assert.equal(
      formatSessionBullet(session, undefined, home),
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)'
    );
    assert.equal(
      formatSessionBullet(session, undefined, home).includes(' @ '),
      false
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
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home);

    assert.equal(
      appendUniqueSessionBullet(markdown, bullet),
      '# note\n\n---\n\n## sessions\n\n- existing-session\n' +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo`\n'
    );
  });

  it('does not add the same session/path pair twice', () => {
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home);
    const markdown = `# note\n\n---\n\n## sessions\n\n${bullet}\n`;

    assert.equal(appendUniqueSessionBullet(markdown, bullet), markdown);
  });

  it('dedupes session/path pairs when display names differ or are absent', () => {
    const path = '/Users/example/workspace/repo';
    const renamedSession = { ...session, name: 'renamed-session' };
    const unnamedSession = { id: session.id };
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      `${formatSessionBullet(renamedSession, path, home)}\n`;

    assert.equal(
      appendUniqueSessionBullet(markdown, formatSessionBullet(unnamedSession, path, home)),
      markdown
    );
  });

  it('preserves existing session bullets without paths', () => {
    const markdown =
      '# note\n\n---\n\n## sessions\n\n' +
      '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session)\n';
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home);

    assert.equal(
      appendUniqueSessionBullet(markdown, bullet),
      markdown +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo`\n'
    );
  });

  it('creates a sessions block when one is missing', () => {
    const bullet = formatSessionBullet(session, '/Users/example/workspace/repo', home);

    assert.equal(
      appendUniqueSessionBullet('# note\n\nbody\n', bullet),
      '# note\n\nbody\n\n---\n\n## sessions\n\n' +
        '- 6eb88af6-507d-445a-b590-25dcf266d175 (my-session) @ `~/workspace/repo`\n'
    );
  });
});
