import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import {
  ensureKnowledgeBaseDirs,
  knowledgeConfigPath,
  loadKnowledgeConfig,
  resolveKnowledgeBase,
} from '../extensions/area.ts';

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function missingFile(): never {
  const error = new Error('missing') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  throw error;
}

function assertOk<T>(result: Result<T>): T {
  if (!result.ok) {
    assert.fail(result.error);
  }
  return result.value;
}

function assertError<T>(result: Result<T>): string {
  if (result.ok) {
    assert.fail(`expected error, got ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

describe('knowledgebase config loading', () => {
  it('reports missing mandatory config at the user-facing path', () => {
    const home = '/tmp/pi-faq-home';

    const result = loadKnowledgeConfig({
      home,
      readFile: missingFile,
    });

    assert.equal(
      knowledgeConfigPath(home),
      join(home, '.pi', 'agent', 'config', 'pi-faq.json')
    );
    assert.match(
      assertError(result),
      /pi-faq config missing at ~\/\.pi\/agent\/config\/pi-faq\.json/
    );
  });

  it('reports invalid JSON with the parser message', () => {
    const result = loadKnowledgeConfig({
      home: '/tmp/pi-faq-home',
      readFile: () => '{"knowledgeBase":',
    });

    assert.match(
      assertError(result),
      /^pi-faq config is invalid JSON:/
    );
  });

  it('requires knowledgeBase', () => {
    const result = loadKnowledgeConfig({
      home: '/tmp/pi-faq-home',
      readFile: () => '{}',
    });

    assert.equal(
      assertError(result),
      'pi-faq config requires "knowledgeBase".'
    );
  });

  it('requires knowledgeBase to be a string', () => {
    const result = loadKnowledgeConfig({
      home: '/tmp/pi-faq-home',
      readFile: () => JSON.stringify({ knowledgeBase: 42 }),
    });

    assert.equal(
      assertError(result),
      'pi-faq config "knowledgeBase" must be a string.'
    );
  });

  it('rejects unknown top-level fields', () => {
    const result = loadKnowledgeConfig({
      home: '/tmp/pi-faq-home',
      readFile: () => JSON.stringify({
        knowledgeBase: '~/k/agent',
        extra: true,
      }),
    });

    assert.equal(
      assertError(result),
      'pi-faq config only accepts "knowledgeBase".'
    );
  });

  it('rejects legacy rootEnvVar fields even when mixed with knowledgeBase', () => {
    const legacyConfigs = [
      { rootEnvVar: 'DOC_ROOT' },
      { rootEnvVarIsFile: false },
      { knowledgeBase: '~/k/agent', rootEnvVar: 'DOC_ROOT' },
      { knowledgeBase: '~/k/agent', rootEnvVarIsFile: false },
    ];

    for (const config of legacyConfigs) {
      const result = loadKnowledgeConfig({
        home: '/tmp/pi-faq-home',
        readFile: () => JSON.stringify(config),
      });

      assert.equal(
        assertError(result),
        'pi-faq config only accepts "knowledgeBase".'
      );
    }
  });
});

describe('knowledgebase resolution', () => {
  it('expands a leading ~/ with the injected HOME', () => {
    const home = '/tmp/pi-faq-home';

    const resolution = assertOk(resolveKnowledgeBase(
      { knowledgeBase: '~/k/agent' },
      { home }
    ));

    assert.equal(resolution.knowledgeBase, join(home, 'k', 'agent'));
    assert.equal(resolution.source, 'config');
  });

  it('accepts absolute paths', () => {
    const knowledgeBase = '/tmp/pi-faq-kb';

    const resolution = assertOk(resolveKnowledgeBase({ knowledgeBase }));

    assert.equal(resolution.knowledgeBase, knowledgeBase);
  });

  it('rejects relative paths and bare ~', () => {
    for (const knowledgeBase of ['relative/path', '~']) {
      const result = resolveKnowledgeBase({ knowledgeBase }, {
        home: '/tmp/pi-faq-home',
      });

      assert.equal(
        assertError(result),
        'pi-faq knowledgeBase must be an absolute path or start with "~/".'
      );
    }
  });

  it('derives faq and ref as direct children without an intermediate doc segment', () => {
    const knowledgeBase = '/tmp/pi-faq-kb';

    const resolution = assertOk(resolveKnowledgeBase({ knowledgeBase }));

    assert.equal(resolution.faqDir, join(knowledgeBase, 'faq'));
    assert.equal(resolution.refDir, join(knowledgeBase, 'ref'));
    assert.equal(relative(knowledgeBase, resolution.faqDir), 'faq');
    assert.equal(relative(knowledgeBase, resolution.refDir), 'ref');
  });

  it('ignores cwd, DOC_ROOT, and ORG_FILE', () => {
    const home = '/tmp/pi-faq-home';
    const envRoot = '/tmp/pi-faq-env-root';
    const cwd = '/tmp/pi-faq-cwd';

    const resolution = assertOk(resolveKnowledgeBase(
      { knowledgeBase: '~/k/agent' },
      {
        home,
        cwd,
        env: {
          DOC_ROOT: envRoot,
          ORG_FILE: '/tmp/pi-faq-org/project.org',
        },
      }
    ));

    assert.equal(resolution.knowledgeBase, join(home, 'k', 'agent'));
    assert.notEqual(resolution.knowledgeBase, cwd);
    assert.notEqual(resolution.knowledgeBase, envRoot);
  });
});

describe('knowledgebase directory creation', () => {
  it('creates faq and ref directories recursively', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'pi-faq-area-'));
    const knowledgeBase = join(parent, 'nested', 'knowledgebase');
    const resolution = assertOk(resolveKnowledgeBase({ knowledgeBase }));

    const result = ensureKnowledgeBaseDirs(resolution);

    assertOk(result);
    assert.equal(existsSync(join(knowledgeBase, 'faq')), true);
    assert.equal(existsSync(join(knowledgeBase, 'ref')), true);
  });

  it('returns a hard error when one directory cannot be created', () => {
    const knowledgeBase = '/tmp/pi-faq-kb';
    const resolution = assertOk(resolveKnowledgeBase({ knowledgeBase }));
    const calls: string[] = [];

    const result = ensureKnowledgeBaseDirs(resolution, {
      mkdir: (path) => {
        calls.push(path);
        if (path === resolution.refDir) {
          throw new Error('permission denied');
        }
      },
    });

    assert.equal(assertError(result),
      'pi-faq could not create knowledgebase directories under ' +
      `${knowledgeBase}: permission denied`);
    assert.deepEqual(calls, [resolution.faqDir, resolution.refDir]);
  });
});
