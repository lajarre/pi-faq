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
  existsSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(EXT_DIR, '..');
const HOME = process.env.HOME ?? '';
const CONFIG_PATH = knowledgeConfigPath(HOME);

interface QnaModeData {
  active: boolean;
}

function stripFrontmatter(content: string): string {
  return content.replace(
    /^---[\s\S]*?---\s*\n/,
    ''
  );
}

function loadConfiguredKnowledgeBase(
): KnowledgeResult<KnowledgeBaseResolution> {
  const configResult = loadKnowledgeConfig({
    home: HOME,
    configPath: CONFIG_PATH,
  });

  if (!configResult.ok) {
    return { ok: false, error: configResult.error };
  }

  return resolveKnowledgeBase(configResult.value, { home: HOME });
}

function ensureConfiguredKnowledgeBase(
): KnowledgeResult<KnowledgeBaseResolution> {
  const resolutionResult = loadConfiguredKnowledgeBase();

  if (!resolutionResult.ok) {
    return { ok: false, error: resolutionResult.error };
  }

  return ensureKnowledgeBaseDirs(resolutionResult.value);
}

function loadRetroPrompt(
  target: string,
  area: KnowledgeBaseResolution,
  focus?: string
): string {
  const path = join(PKG_DIR, 'prompts', 'retro.md');
  let prompt = '';
  try {
    prompt = stripFrontmatter(
      readFileSync(path, 'utf-8')
    );
  } catch {
    prompt = 'Extract learnings from ' + target +
      (focus ? `. Focus on: ${focus}` : '');
  }
  const focusBlock = focus
    ? `## focus\n\nConcentrate on: ${focus}`
    : '';
  const focusQuery = focus
    ? `Focus especially on: ${focus}`
    : '';
  const lit = (s: string) => () => s;
  return prompt
    .replace(/\{\{SESSION_TARGET\}\}/g, lit(target))
    .replace(/\{\{KNOWLEDGE_BASE\}\}/g,
      lit(area.knowledgeBase))
    .replace(/\{\{DOC_ROOT\}\}/g,
      lit(area.knowledgeBase))
    .replace(/\{\{FAQ_DIR\}\}/g, lit(area.faqDir))
    .replace(/\{\{REF_DIR\}\}/g, lit(area.refDir))
    .replace(/\{\{FOCUS\}\}\n*/g,
      lit(focusBlock ? focusBlock + '\n' : ''))
    .replace(/\{\{FOCUS_QUERY\}\}\n?/g,
      lit(focusQuery ? focusQuery + '\n' : ''));
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

function getDocHint(
  area: KnowledgeBaseResolution
): string {
  const hasFaq = existsSync(area.faqDir);
  const hasRef = existsSync(area.refDir);

  if (!hasFaq && !hasRef) return '';

  const lines = [
    'local docs may exist here:',
  ];

  if (hasFaq) {
    lines.push(`- ${area.faqDir} — terse notes`);
  }
  if (hasRef) {
    lines.push(`- ${area.refDir} — longer refs`);
  }

  lines.push('search them when relevant.');
  return lines.join('\n');
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

  // Inject local doc hint always; add Q&A rules when active
  pi.on("before_agent_start", async (event, ctx) => {
    const areaResult = loadConfiguredKnowledgeBase();

    if (!areaResult.ok) {
      if (!qnaActive) return;
      return {
        systemPrompt: event.systemPrompt +
          '\n\n## Q&A mode unavailable\n\n' +
          areaResult.error,
      };
    }

    const area = areaResult.value;
    const docHint = getDocHint(area);

    if (!qnaActive) {
      if (!docHint) return;
      return {
        systemPrompt: event.systemPrompt +
          '\n\n## local docs\n\n' +
          docHint,
      };
    }

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
      .replace(/\{KNOWLEDGE_BASE\}/g, area.knowledgeBase)
      .replace(/\{DOC_ROOT\}/g, area.knowledgeBase);

    const promptParts = [event.systemPrompt];
    promptParts.push(
      '## Q&A mode is ACTIVE\n\n' +
      `FAQ dir: ${area.faqDir}\n` +
      `Ref dir: ${area.refDir}\n` +
      `Knowledgebase: ${area.knowledgeBase}\n` +
      `Source: ${area.source}\n\n` +
      fillPaths(helperContent) +
      '\n\n---\n\n' +
      '## Writing conventions (inlined)\n\n' +
      fillPaths(writingContent)
    );

    return {
      systemPrompt: promptParts.join('\n\n'),
    };
  });

  // /qna command
  pi.registerCommand('qna', {
    description: 'Toggle Q&A knowledge capture mode',
    handler: async (args, ctx) => {
      const isOff = args.trim().toLowerCase() === 'off';
      if (isOff) {
        qnaActive = false;
        pi.appendEntry('qna-mode', { active: false });
        ctx.ui.notify('Q&A mode OFF.', "info");
        return;
      }

      const areaResult = ensureConfiguredKnowledgeBase();
      if (!areaResult.ok) {
        qnaActive = false;
        pi.appendEntry('qna-mode', { active: false });
        ctx.ui.notify(areaResult.error, "error");
        return;
      }

      qnaActive = true;
      pi.appendEntry('qna-mode', { active: true });
      const area = areaResult.value;
      ctx.ui.notify(
        `Q&A mode ON. Capturing to ` +
        `${area.faqDir} and ${area.refDir} ` +
        `(${area.source}).`,
        "info"
      );
    },
  });

  // /retro command
  // usage: /retro [session] [focus text]
  // session is a UUID or prefix (hex/dashes);
  // everything else is focus guidance.
  pi.registerCommand('retro', {
    description:
      'Extract learnings from session ' +
      '(optional: session id + focus prompt)',
    handler: async (args, ctx) => {
      const areaResult = ensureConfiguredKnowledgeBase();
      if (!areaResult.ok) {
        ctx.ui.notify(areaResult.error, "error");
        return;
      }

      const area = areaResult.value;

      const parts = args.trim();
      let session = '';
      let focus = '';

      // Split on first whitespace to isolate token 1.
      // Session IDs are UUIDs or hex prefixes: the
      // first token is a session if it is entirely
      // hex chars and dashes, ≥8 chars.
      const spaceIdx = parts.search(/\s/);
      const firstToken = spaceIdx === -1
        ? parts
        : parts.slice(0, spaceIdx);
      const isSession = /^[0-9a-f][0-9a-f-]{7,}$/i
        .test(firstToken);

      if (isSession) {
        session = firstToken;
        focus = spaceIdx === -1
          ? ''
          : parts.slice(spaceIdx).trim();
      } else {
        focus = parts;
      }

      const target = session
        ? `session '${session}'`
        : 'current session';

      pi.sendUserMessage(
        loadRetroPrompt(target, area, focus || undefined)
      );
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
