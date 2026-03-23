import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from '@sinclair/typebox';
import {
  resolveArea,
  loadAreaConfig,
} from './area.js';
import type { AreaConfig } from './area.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(EXT_DIR, '..');
const areaConfig: AreaConfig = loadAreaConfig(
  join(EXT_DIR, 'config.json')
);

interface QnaModeData {
  active: boolean;
}

function stripFrontmatter(content: string): string {
  return content.replace(
    /^---[\s\S]*?---\s*\n/,
    ''
  );
}

function loadRetroPrompt(
  target: string,
  area: ReturnType<typeof resolveArea>
): string {
  const path = join(PKG_DIR, 'prompts', 'retro.md');
  let prompt = '';
  try {
    prompt = stripFrontmatter(
      readFileSync(path, 'utf-8')
    );
  } catch {
    prompt = 'Extract learnings from ' + target;
  }
  return prompt
    .replace(/\{\{SESSION_TARGET\}\}/g, target)
    .replace(/\{\{DOC_ROOT\}\}/g, area.docRoot)
    .replace(/\{\{FAQ_DIR\}\}/g, area.faqDir)
    .replace(/\{\{REF_DIR\}\}/g, area.refDir);
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

export default function createExtension(
  pi: ExtensionAPI
) {
  let qnaActive = false;

  // Restore on session lifecycle events
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

  // Inject helper-mode + writing rules when QNA is active
  pi.on("before_agent_start", async (event, ctx) => {
    if (!qnaActive) return;

    const area = resolveArea(ctx.cwd, areaConfig);

    // Load helper-mode (behavioral rules)
    const helperPath = join(
      PKG_DIR, 'internal', 'helper-mode', 'SKILL.md'
    );
    let helperContent = '';
    try {
      helperContent = stripFrontmatter(
        readFileSync(helperPath, 'utf-8')
      );
    } catch {
      helperContent = 'helper-mode skill not found.';
    }

    // Load doc-faq-writing (format rules)
    const writingPath = join(
      PKG_DIR, 'skills', 'doc-faq-writing', 'SKILL.md'
    );
    let writingContent = '';
    try {
      writingContent = stripFrontmatter(
        readFileSync(writingPath, 'utf-8')
      );
    } catch {
      writingContent = '';
    }

    // Replace placeholders with resolved absolutes
    const fillPaths = (s: string) => s
      .replace(/\{FAQ_DIR\}/g, area.faqDir)
      .replace(/\{REF_DIR\}/g, area.refDir)
      .replace(/\{DOC_ROOT\}/g, area.docRoot);

    return {
      systemPrompt: event.systemPrompt +
        '\n\n## Q&A mode is ACTIVE\n\n' +
        `FAQ dir: ${area.faqDir}\n` +
        `Ref dir: ${area.refDir}\n` +
        `Source: ${area.source}\n\n` +
        fillPaths(helperContent) +
        '\n\n---\n\n' +
        '## Writing conventions (inlined)\n\n' +
        fillPaths(writingContent),
    };
  });

  // /qna command
  pi.registerCommand('qna', {
    description: 'Toggle Q&A knowledge capture mode',
    handler: async (args, ctx) => {
      const isOff = args.trim().toLowerCase() === 'off';
      qnaActive = !isOff;
      pi.appendEntry('qna-mode', { active: qnaActive });

      const area = resolveArea(ctx.cwd, areaConfig);
      if (qnaActive) {
        ctx.ui.notify(
          `Q&A mode ON. Capturing to ` +
          `${area.faqDir} and ${area.refDir} ` +
          `(${area.source}).`,
          "info"
        );
      } else {
        ctx.ui.notify('Q&A mode OFF.', "info");
      }
    },
  });

  // /retro command
  pi.registerCommand('retro', {
    description: 'Extract learnings from session',
    handler: async (args, ctx) => {
      const session = args.trim() || '';
      const area = resolveArea(ctx.cwd, areaConfig);
      const target = session
        ? `session '${session}'`
        : 'current session';

      pi.sendUserMessage(loadRetroPrompt(target, area));
    },
  });

  // qna_mode tool — advisory only, no state mutation
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

  // retro tool — advisory only, no state mutation
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
      "discoveries, decisions).",
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
