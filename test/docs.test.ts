import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = new URL('..', import.meta.url).pathname;

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function assertDoesNotDescribeOldActiveFallback(text: string, path: string): void {
  for (const legacyTerm of [
    'rootEnvVar',
    'rootEnvVarIsFile',
    'DOC_ROOT',
    'ORG_FILE',
    '$PWD/doc',
  ]) {
    assert.equal(
      text.includes(legacyTerm),
      false,
      `${path} must not retain active legacy destination guidance for ${legacyTerm}`
    );
  }
}

describe('user-facing knowledgebase documentation', () => {
  it('documents mandatory configured knowledgebase behavior in README', () => {
    const readme = readRepoFile('README.md');

    for (const expected of [
      'mandatory',
      '~/.pi/agent/config/pi-faq.json',
      '"knowledgeBase": "~/k/agent"',
      '<knowledgeBase>/faq/',
      '<knowledgeBase>/ref/',
      'No fallback destination is used.',
      '/qna',
      '/retro',
      'before_agent_start',
      '## sessions',
      '@ `~/workspace/example-repo` @ 2026-05-29',
      'Do not add a separate sources block',
      'npm run validate-provenance',
      'Run the migration in dry-run mode first',
      'source docs are not deleted, moved, or modified',
    ]) {
      assert.match(readme, new RegExp(escapeRegExp(expected)));
    }

    assertDoesNotDescribeOldActiveFallback(readme, 'README.md');
  });

  it('keeps config example limited to knowledgeBase', () => {
    const config = JSON.parse(readRepoFile('config.json.example')) as Record<string, unknown>;

    assert.deepEqual(Object.keys(config), ['knowledgeBase']);
    assert.equal(config.knowledgeBase, '~/k/agent');
  });

  it('documents configured dirs and session/path provenance in skills', () => {
    const docFaq = readRepoFile('skills/doc-faq/SKILL.md');
    const docFaqWriting = readRepoFile('skills/doc-faq-writing/SKILL.md');
    const combined = `${docFaq}\n${docFaqWriting}`;

    for (const expected of [
      '{FAQ_DIR}',
      '{REF_DIR}',
      'resolved from the mandatory `knowledgeBase` config',
      'exactly one `## sessions` block',
      'Do not create `## sources`',
      'session/path/date tuple',
      '@ `~/workspace/example-repo` @ {CAPTURE_DATE}',
      'Do not write the word "captured"',
    ]) {
      assert.match(combined, new RegExp(escapeRegExp(expected)));
    }

    assertDoesNotDescribeOldActiveFallback(combined, 'skills');
  });

  it('gates helper-mode write obligations on valid config', () => {
    const helperMode = readRepoFile('internal/helper-mode/SKILL.md');

    for (const expected of [
      'only after pi-faq has resolved a valid `knowledgeBase` config',
      'If config is missing or invalid, do not write',
      'Every answer you give MUST produce a write',
    ]) {
      assert.match(helperMode, new RegExp(escapeRegExp(expected)));
    }

    assertDoesNotDescribeOldActiveFallback(helperMode, 'internal/helper-mode/SKILL.md');
  });

  it('keeps retro prompt on configured knowledgebase terminology and renderer tokens', () => {
    const retro = readRepoFile('prompts/retro.md');

    for (const expected of [
      '{KNOWLEDGE_BASE}',
      '{FAQ_DIR}',
      '{REF_DIR}',
      '{SOURCE_PATH}',
      '{CAPTURE_DATE}',
      '{SESSION_TARGET}',
      '{FOCUS}',
      '{FOCUS_QUERY}',
      'configured knowledgebase',
      'if config is missing, invalid, or directories cannot be used',
      'ask for cwd/project context when possible',
      'without inventing a path',
    ]) {
      assert.match(retro, new RegExp(escapeRegExp(expected)));
    }

    assertDoesNotDescribeOldActiveFallback(retro, 'prompts/retro.md');
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
