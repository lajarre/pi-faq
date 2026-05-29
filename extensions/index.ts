import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from '@sinclair/typebox';
import {
  ensureKnowledgeBaseDirs,
  knowledgeConfigPath,
  loadKnowledgeConfig,
  resolveKnowledgeBase,
  type KnowledgeBaseResolution,
  type KnowledgeResult,
} from './area.js';
import {
  buildBeforeAgentStartPrompt,
  handleQnaCommand,
  handleRetroCommand,
  renderRetroPrompt,
  type FlowNotification,
  type RetroPromptValues,
} from './flow.js';
import {
  sourcePathFromContext,
} from './provenance.js';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(EXT_DIR, '..');
const CONFIG_DISPLAY_PATH = '~/.pi/agent/config/pi-faq.json';

interface QnaModeData {
  active: boolean;
}

function stripFrontmatter(content: string): string {
  return content.replace(
    /^---[\s\S]*?---\s*\n/,
    ''
  );
}

function currentHome(): string {
  return process.env.HOME ?? '';
}

function currentCaptureDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadConfiguredKnowledgeBase(
): KnowledgeResult<KnowledgeBaseResolution> {
  const home = currentHome();
  const configResult = loadKnowledgeConfig({
    home,
    configPath: knowledgeConfigPath(home),
    displayPath: CONFIG_DISPLAY_PATH,
  });

  if (!configResult.ok) {
    return { ok: false, error: configResult.error };
  }

  return resolveKnowledgeBase(configResult.value, { home });
}

function loadPackageFile(
  path: string,
  fallback = ''
): string {
  try {
    return stripFrontmatter(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function loadRetroPrompt(
  values: RetroPromptValues
): string {
  const path = join(PKG_DIR, 'prompts', 'retro.md');
  const template = loadPackageFile(
    path,
    'Extract durable knowledge from {SESSION_TARGET}.\n\n{FOCUS}'
  );

  return renderRetroPrompt(template, values);
}

function restoreQnaState(
  ctx: ExtensionContext
): boolean {
  let active = false;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (
      entry.type === "custom" &&
      entry.customType === "qna-mode"
    ) {
      const data = entry.data as QnaModeData | undefined;
      active = data?.active ?? false;
    }
  }
  return active;
}

function notifyAll(
  ctx: ExtensionContext,
  notifications: FlowNotification[]
): void {
  for (const notification of notifications) {
    ctx.ui.notify(notification.message, notification.level);
  }
}

export default function createExtension(
  pi: ExtensionAPI
) {
  let qnaActive = false;

  pi.on("session_start", async (_event, ctx) => {
    qnaActive = restoreQnaState(ctx);
  });
  pi.on("session_switch", async (_event, ctx) => {
    qnaActive = restoreQnaState(ctx);
  });
  pi.on("session_fork", async (_event, ctx) => {
    qnaActive = restoreQnaState(ctx);
  });
  pi.on("session_tree", async (_event, ctx) => {
    qnaActive = restoreQnaState(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const systemPrompt = buildBeforeAgentStartPrompt({
      systemPrompt: event.systemPrompt,
      qnaActive,
      captureDate: currentCaptureDate(),
      sourcePath: sourcePathFromContext(ctx, {
        home: currentHome(),
        exists: existsSync,
      }),
      resolveKnowledgeBase: loadConfiguredKnowledgeBase,
      exists: existsSync,
      helperModeContent: loadPackageFile(
        join(PKG_DIR, 'internal', 'helper-mode', 'SKILL.md'),
        'helper-mode skill not found.'
      ),
      writingConventionsContent: loadPackageFile(
        join(PKG_DIR, 'skills', 'doc-faq-writing', 'SKILL.md')
      ),
    });

    if (!systemPrompt) {
      return;
    }

    return { systemPrompt };
  });

  pi.registerCommand('qna', {
    description: 'Toggle Q&A knowledge capture mode',
    handler: async (args, ctx) => {
      const decision = handleQnaCommand({
        args,
        resolveKnowledgeBase: loadConfiguredKnowledgeBase,
        ensureKnowledgeBaseDirs,
      });

      qnaActive = decision.active;
      if (decision.stateEntry) {
        pi.appendEntry('qna-mode', decision.stateEntry);
      }
      notifyAll(ctx, decision.notifications);
    },
  });

  pi.registerCommand('retro', {
    description:
      'Extract learnings from session ' +
      '(optional: session id + focus prompt)',
    handler: async (args, ctx) => {
      const decision = handleRetroCommand({
        args,
        sourcePath: sourcePathFromContext(ctx, {
          home: currentHome(),
          exists: existsSync,
        }),
        resolveKnowledgeBase: loadConfiguredKnowledgeBase,
        ensureKnowledgeBaseDirs,
        buildPrompt: loadRetroPrompt,
      });

      notifyAll(ctx, decision.notifications);
      if (decision.shouldSendMessage && decision.prompt) {
        pi.sendUserMessage(decision.prompt);
      }
    },
  });

  pi.registerTool({
    name: 'qna_mode',
    label: 'Q&A Mode',
    description: 'Check Q&A mode status or suggest activation',
    parameters: Type.Object({
      active: Type.Boolean(),
    }),
    promptGuidelines: [
      "Suggest /qna when user has asked 3+ " +
      "questions on the same topic without " +
      "implementation work.",
      "Do not suggest during debugging or code " +
      "editing. Do not re-suggest after decline.",
    ],
    async execute(
      toolCallId, params, signal, onUpdate, ctx
    ) {
      const action = params.active ? '/qna' : '/qna off';
      return {
        content: [{
          type: "text",
          text: `Q&A mode can only be toggled by ` +
            `the user. Suggest they run \`${action}\`.`,
        }],
        details: {
          currentState: qnaActive,
          suggestedCommand: action,
        },
      };
    },
  });

  pi.registerTool({
    name: 'retro',
    label: 'Retro',
    description: 'Suggest retrospective extraction',
    parameters: Type.Object({
      session: Type.Optional(Type.String()),
    }),
    promptGuidelines: [
      "Suggest /retro at end of long sessions " +
      "with significant learnings (gotchas, " +
      "discoveries, decisions). Mention that " +
      "a focus prompt can guide extraction " +
      "(e.g. /retro the debugging approach).",
      "Do not suggest if user already ran " +
      "/retro this session.",
    ],
    async execute(
      toolCallId, params, signal, onUpdate, ctx
    ) {
      const cmd = params.session
        ? `/retro ${params.session}`
        : '/retro';
      return {
        content: [{
          type: "text",
          text: `Retro can only be triggered by ` +
            `the user. Suggest they run ` +
            `\`${cmd}\`.`,
        }],
        details: {
          suggestedCommand: cmd,
        },
      };
    },
  });
}
