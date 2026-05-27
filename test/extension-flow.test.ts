import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildBeforeAgentStartPrompt,
  handleQnaCommand,
  handleRetroCommand,
  renderRetroPrompt,
  type KnowledgeBaseResolution,
  type KnowledgeResult,
  type RetroPromptValues,
} from '../extensions/flow.ts';

const resolution: KnowledgeBaseResolution = {
  knowledgeBase: '/knowledgebase',
  faqDir: '/knowledgebase/faq',
  refDir: '/knowledgebase/ref',
  source: 'config',
};

function ok<T>(value: T): KnowledgeResult<T> {
  return { ok: true, value };
}

function error<T>(message: string): KnowledgeResult<T> {
  return { ok: false, error: message };
}

function qnaFailureDecision(message: string) {
  return handleQnaCommand({
    args: '',
    resolveKnowledgeBase: () => error(message),
    ensureKnowledgeBaseDirs: () => {
      assert.fail('directory creation should not run after resolver failure');
    },
  });
}

describe('/qna flow decisions', () => {
  it('reports missing config, returns inactive state, and does not append active Q&A state', () => {
    const message = 'pi-faq config missing at ~/.pi/agent/config/pi-faq.json.';

    const decision = qnaFailureDecision(message);

    assert.equal(decision.active, false);
    assert.notEqual(decision.stateEntry?.active, true);
    assert.deepEqual(decision.notifications, [{ level: 'error', message }]);
  });

  it('reports invalid config, returns inactive state, and does not append active Q&A state', () => {
    const message = 'pi-faq config requires "knowledgeBase".';

    const decision = qnaFailureDecision(message);

    assert.equal(decision.active, false);
    assert.notEqual(decision.stateEntry?.active, true);
    assert.deepEqual(decision.notifications, [{ level: 'error', message }]);
  });

  it('reports directory creation failure and leaves Q&A off', () => {
    const message = 'pi-faq could not create knowledgebase directories under /knowledgebase: denied';

    const decision = handleQnaCommand({
      args: '',
      resolveKnowledgeBase: () => ok(resolution),
      ensureKnowledgeBaseDirs: () => error(message),
    });

    assert.equal(decision.active, false);
    assert.notEqual(decision.stateEntry?.active, true);
    assert.deepEqual(decision.notifications, [{ level: 'error', message }]);
  });

  it('appends active state and reports resolved dirs after successful directory creation', () => {
    const decision = handleQnaCommand({
      args: '',
      resolveKnowledgeBase: () => ok(resolution),
      ensureKnowledgeBaseDirs: (value) => ok(value),
    });

    assert.equal(decision.active, true);
    assert.deepEqual(decision.stateEntry, { active: true });
    assert.equal(decision.resolution, resolution);
    assert.equal(decision.notifications[0]?.level, 'info');
    assert.match(decision.notifications[0]?.message ?? '', /knowledgeBase: \/knowledgebase/);
    assert.match(decision.notifications[0]?.message ?? '', /faqDir: \/knowledgebase\/faq/);
    assert.match(decision.notifications[0]?.message ?? '', /refDir: \/knowledgebase\/ref/);
  });

  it('turns Q&A off without requiring config resolution', () => {
    let resolverCalled = false;

    const decision = handleQnaCommand({
      args: ' off ',
      resolveKnowledgeBase: () => {
        resolverCalled = true;
        return error('resolver should not run');
      },
      ensureKnowledgeBaseDirs: () => {
        assert.fail('directory creation should not run for /qna off');
      },
    });

    assert.equal(resolverCalled, false);
    assert.equal(decision.active, false);
    assert.deepEqual(decision.stateEntry, { active: false });
    assert.deepEqual(decision.notifications, [{ level: 'info', message: 'Q&A mode OFF.' }]);
  });
});

describe('/retro flow decisions', () => {
  it('does not send a prompt when config is missing or invalid', () => {
    for (const message of [
      'pi-faq config missing at ~/.pi/agent/config/pi-faq.json.',
      'pi-faq config requires "knowledgeBase".',
    ]) {
      const sent: string[] = [];
      let promptBuilderCalled = false;

      const decision = handleRetroCommand({
        args: '',
        sourcePath: '/source/project',
        resolveKnowledgeBase: () => error(message),
        ensureKnowledgeBaseDirs: () => {
          assert.fail('directory creation should not run after resolver failure');
        },
        buildPrompt: () => {
          promptBuilderCalled = true;
          return 'unexpected prompt';
        },
        sendMessage: (prompt) => sent.push(prompt),
      });

      assert.equal(decision.shouldSendMessage, false);
      assert.equal(promptBuilderCalled, false);
      assert.deepEqual(sent, []);
      assert.deepEqual(decision.notifications, [{ level: 'error', message }]);
    }
  });

  it('does not send a prompt when directory creation fails', () => {
    const sent: string[] = [];
    let promptBuilderCalled = false;
    const message = 'pi-faq could not create knowledgebase directories under /knowledgebase: denied';

    const decision = handleRetroCommand({
      args: '',
      sourcePath: '/source/project',
      resolveKnowledgeBase: () => ok(resolution),
      ensureKnowledgeBaseDirs: () => error(message),
      buildPrompt: () => {
        promptBuilderCalled = true;
        return 'unexpected prompt';
      },
      sendMessage: (prompt) => sent.push(prompt),
    });

    assert.equal(decision.shouldSendMessage, false);
    assert.equal(promptBuilderCalled, false);
    assert.deepEqual(sent, []);
    assert.deepEqual(decision.notifications, [{ level: 'error', message }]);
  });

  it('builds and sends a prompt with resolved dirs, target, focus, and source path', () => {
    const sent: string[] = [];
    let promptValues: RetroPromptValues | undefined;
    const template = [
      'target={SESSION_TARGET}',
      'kb={KNOWLEDGE_BASE}',
      'faq={FAQ_DIR}',
      'ref={REF_DIR}',
      'source={SOURCE_PATH}',
      'focus={FOCUS}',
      'query={FOCUS_QUERY}',
    ].join('\n');

    const decision = handleRetroCommand({
      args: 'deadbeef capture config details',
      sourcePath: '/source/project',
      resolveKnowledgeBase: () => ok(resolution),
      ensureKnowledgeBaseDirs: (value) => ok(value),
      buildPrompt: (values) => {
        promptValues = values;
        return renderRetroPrompt(template, values);
      },
      sendMessage: (prompt) => sent.push(prompt),
    });

    assert.equal(decision.shouldSendMessage, true);
    assert.equal(decision.prompt, sent[0]);
    assert.deepEqual(promptValues, {
      knowledgeBase: '/knowledgebase',
      faqDir: '/knowledgebase/faq',
      refDir: '/knowledgebase/ref',
      target: "session 'deadbeef'",
      session: 'deadbeef',
      focus: 'capture config details',
      sourcePath: '/source/project',
    });
    assert.match(sent[0] ?? '', /target=session 'deadbeef'/);
    assert.match(sent[0] ?? '', /kb=\/knowledgebase/);
    assert.match(sent[0] ?? '', /faq=\/knowledgebase\/faq/);
    assert.match(sent[0] ?? '', /ref=\/knowledgebase\/ref/);
    assert.match(sent[0] ?? '', /source=\/source\/project/);
    assert.match(sent[0] ?? '', /Concentrate on: capture config details/);
    assert.match(sent[0] ?? '', /Focus especially on: capture config details/);
  });
});

describe('before_agent_start prompt decisions', () => {
  it('returns no fallback local-doc hint when config is invalid and Q&A is inactive', () => {
    const prompt = buildBeforeAgentStartPrompt({
      systemPrompt: 'base prompt',
      qnaActive: false,
      resolveKnowledgeBase: () => error('pi-faq config requires "knowledgeBase".'),
      exists: () => {
        assert.fail('filesystem fallback should not run for invalid config');
      },
      helperModeContent: 'Every answer MUST produce a write.',
      writingConventionsContent: 'Writing conventions.',
    });

    assert.equal(prompt, undefined);
  });

  it('injects only a short unavailable note when config is invalid and Q&A is active', () => {
    const prompt = buildBeforeAgentStartPrompt({
      systemPrompt: 'base prompt',
      qnaActive: true,
      resolveKnowledgeBase: () => error('pi-faq config requires "knowledgeBase".'),
      exists: () => {
        assert.fail('filesystem fallback should not run for invalid config');
      },
      helperModeContent: 'Every answer MUST produce a write.',
      writingConventionsContent: 'Writing conventions.',
    });

    assert.ok(prompt);
    assert.match(prompt, /base prompt/);
    assert.match(prompt, /Q&A mode unavailable/);
    assert.match(prompt, /pi-faq config requires "knowledgeBase"\./);
    assert.doesNotMatch(prompt, /Every answer MUST produce a write/);
    assert.doesNotMatch(prompt, /Writing conventions/);
    assert.doesNotMatch(prompt, /FAQ dir:/);
  });

  it('injects a local-doc hint using configured dirs when faq or ref exists', () => {
    for (const existingPath of [resolution.faqDir, resolution.refDir]) {
      const prompt = buildBeforeAgentStartPrompt({
        systemPrompt: 'base prompt',
        qnaActive: false,
        resolveKnowledgeBase: () => ok(resolution),
        exists: (path) => path === existingPath,
      });

      assert.ok(prompt);
      assert.match(prompt, /## local docs/);
      assert.match(prompt, /local docs may exist here/);
      assert.match(prompt, new RegExp(existingPath.replaceAll('/', '\\/')));
    }
  });

  it('injects configured dirs, source path, helper-mode content, and writing conventions when Q&A is active', () => {
    const prompt = buildBeforeAgentStartPrompt({
      systemPrompt: 'base prompt',
      qnaActive: true,
      sourcePath: '/source/project',
      resolveKnowledgeBase: () => ok(resolution),
      exists: () => false,
      helperModeContent: 'helper-mode content for {FAQ_DIR} from {SOURCE_PATH}',
      writingConventionsContent: 'writing conventions for {REF_DIR} in {KNOWLEDGE_BASE}',
    });

    assert.ok(prompt);
    assert.match(prompt, /Q&A mode is ACTIVE/);
    assert.match(prompt, /Knowledgebase: \/knowledgebase/);
    assert.match(prompt, /FAQ dir: \/knowledgebase\/faq/);
    assert.match(prompt, /Ref dir: \/knowledgebase\/ref/);
    assert.match(prompt, /Source path: \/source\/project/);
    assert.match(prompt, /helper-mode content for \/knowledgebase\/faq from \/source\/project/);
    assert.match(prompt, /## Writing conventions/);
    assert.match(prompt, /writing conventions for \/knowledgebase\/ref in \/knowledgebase/);
  });
});
