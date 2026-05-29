export interface KnowledgeBaseResolution {
  knowledgeBase: string;
  faqDir: string;
  refDir: string;
  source: 'config';
}

export type KnowledgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type NotificationLevel = 'info' | 'error';

export interface FlowNotification {
  level: NotificationLevel;
  message: string;
}

export interface QnaStateEntry {
  active: boolean;
}

export interface QnaCommandInput {
  args: string;
  resolveKnowledgeBase: () => KnowledgeResult<KnowledgeBaseResolution>;
  ensureKnowledgeBaseDirs: (
    resolution: KnowledgeBaseResolution
  ) => KnowledgeResult<KnowledgeBaseResolution>;
}

export interface QnaCommandDecision {
  active: boolean;
  stateEntry?: QnaStateEntry;
  notifications: FlowNotification[];
  resolution?: KnowledgeBaseResolution;
}

export interface RetroPromptValues {
  knowledgeBase: string;
  faqDir: string;
  refDir: string;
  captureDate: string;
  target: string;
  session?: string;
  focus?: string;
  sourcePath?: string;
}

export interface RetroCommandInput {
  args: string;
  captureDate?: string;
  sourcePath?: string;
  resolveKnowledgeBase: () => KnowledgeResult<KnowledgeBaseResolution>;
  ensureKnowledgeBaseDirs: (
    resolution: KnowledgeBaseResolution
  ) => KnowledgeResult<KnowledgeBaseResolution>;
  buildPrompt: (values: RetroPromptValues) => string;
  sendMessage?: (prompt: string) => void;
}

export interface RetroCommandDecision {
  shouldSendMessage: boolean;
  notifications: FlowNotification[];
  prompt?: string;
  values?: RetroPromptValues;
}

export interface RetroArgs {
  target: string;
  session?: string;
  focus?: string;
}

export interface BeforeAgentStartPromptInput {
  systemPrompt: string;
  qnaActive: boolean;
  captureDate?: string;
  sourcePath?: string;
  resolveKnowledgeBase: () => KnowledgeResult<KnowledgeBaseResolution>;
  exists: (path: string) => boolean;
  helperModeContent?: string;
  writingConventionsContent?: string;
}

export function handleQnaCommand(
  input: QnaCommandInput
): QnaCommandDecision {
  if (input.args.trim().toLowerCase() === 'off') {
    return {
      active: false,
      stateEntry: { active: false },
      notifications: [{ level: 'info', message: 'Q&A mode OFF.' }],
    };
  }

  const resolutionResult = input.resolveKnowledgeBase();
  if (!resolutionResult.ok) {
    return qnaFailure(resolutionResult.error);
  }

  const ensureResult = input.ensureKnowledgeBaseDirs(resolutionResult.value);
  if (!ensureResult.ok) {
    return qnaFailure(ensureResult.error);
  }

  const resolution = ensureResult.value;

  return {
    active: true,
    stateEntry: { active: true },
    notifications: [{
      level: 'info',
      message: [
        'Q&A mode ON.',
        `knowledgeBase: ${resolution.knowledgeBase}`,
        `faqDir: ${resolution.faqDir}`,
        `refDir: ${resolution.refDir}`,
      ].join(' '),
    }],
    resolution,
  };
}

export function handleRetroCommand(
  input: RetroCommandInput
): RetroCommandDecision {
  const resolutionResult = input.resolveKnowledgeBase();
  if (!resolutionResult.ok) {
    return retroFailure(resolutionResult.error);
  }

  const ensureResult = input.ensureKnowledgeBaseDirs(resolutionResult.value);
  if (!ensureResult.ok) {
    return retroFailure(ensureResult.error);
  }

  const resolution = ensureResult.value;
  const args = parseRetroArgs(input.args);
  const values: RetroPromptValues = {
    knowledgeBase: resolution.knowledgeBase,
    faqDir: resolution.faqDir,
    refDir: resolution.refDir,
    captureDate: input.captureDate ?? today(),
    target: args.target,
    sourcePath: input.sourcePath,
  };

  if (args.session) {
    values.session = args.session;
  }
  if (args.focus) {
    values.focus = args.focus;
  }

  const prompt = input.buildPrompt(values);
  input.sendMessage?.(prompt);

  return {
    shouldSendMessage: true,
    notifications: [],
    prompt,
    values,
  };
}

export function buildBeforeAgentStartPrompt(
  input: BeforeAgentStartPromptInput
): string | undefined {
  const resolutionResult = input.resolveKnowledgeBase();

  if (!resolutionResult.ok) {
    if (!input.qnaActive) {
      return undefined;
    }

    return [
      input.systemPrompt,
      '## Q&A mode unavailable',
      'pi-faq config is invalid, so Q&A capture is unavailable.',
    ].join('\n\n');
  }

  const resolution = resolutionResult.value;

  if (!input.qnaActive) {
    const docHint = buildLocalDocHint(resolution, input.exists);
    if (!docHint) {
      return undefined;
    }

    return [
      input.systemPrompt,
      '## local docs',
      docHint,
    ].join('\n\n');
  }

  const sourcePath = input.sourcePath ?? 'unavailable';
  const captureDate = input.captureDate ?? today();
  const helperModeContent = fillFlowTokens(
    input.helperModeContent ?? '',
    resolution,
    sourcePath,
    captureDate
  );
  const writingConventionsContent = fillFlowTokens(
    input.writingConventionsContent ?? '',
    resolution,
    sourcePath,
    captureDate
  );

  return [
    input.systemPrompt,
    '## Q&A mode is ACTIVE\n\n' +
      `Knowledgebase: ${resolution.knowledgeBase}\n` +
      `FAQ dir: ${resolution.faqDir}\n` +
      `Ref dir: ${resolution.refDir}\n` +
      `Source path: ${sourcePath}\n\n` +
      `Capture date: ${captureDate}\n\n` +
      helperModeContent +
      '\n\n---\n\n' +
      '## Writing conventions (inlined)\n\n' +
      writingConventionsContent,
  ].join('\n\n');
}

export function renderRetroPrompt(
  template: string,
  values: RetroPromptValues
): string {
  const focus = values.focus ?? '';
  const replacements: Record<string, string> = {
    SESSION_TARGET: values.target,
    KNOWLEDGE_BASE: values.knowledgeBase,
    FAQ_DIR: values.faqDir,
    REF_DIR: values.refDir,
    CAPTURE_DATE: values.captureDate,
    SOURCE_PATH: values.sourcePath ?? '',
    FOCUS: focus ? `## focus\n\nConcentrate on: ${focus}` : '',
    FOCUS_QUERY: focus ? `Focus especially on: ${focus}` : '',
  };

  return replaceSingleBraceTokens(template, replacements);
}

export function parseRetroArgs(args: string): RetroArgs {
  const trimmed = args.trim();

  if (!trimmed) {
    return { target: 'current session' };
  }

  const spaceIndex = trimmed.search(/\s/);
  const firstToken = spaceIndex === -1
    ? trimmed
    : trimmed.slice(0, spaceIndex);
  const isSession = /^[0-9a-f][0-9a-f-]{7,}$/i.test(firstToken);

  if (!isSession) {
    return { target: 'current session', focus: trimmed };
  }

  const focus = spaceIndex === -1
    ? ''
    : trimmed.slice(spaceIndex).trim();
  const result: RetroArgs = {
    target: `session '${firstToken}'`,
    session: firstToken,
  };

  if (focus) {
    result.focus = focus;
  }

  return result;
}

function qnaFailure(message: string): QnaCommandDecision {
  return {
    active: false,
    stateEntry: { active: false },
    notifications: [{ level: 'error', message }],
  };
}

function retroFailure(message: string): RetroCommandDecision {
  return {
    shouldSendMessage: false,
    notifications: [{ level: 'error', message }],
  };
}

function buildLocalDocHint(
  resolution: KnowledgeBaseResolution,
  exists: (path: string) => boolean
): string {
  const lines = ['local docs may exist here:'];

  if (exists(resolution.faqDir)) {
    lines.push(`- ${resolution.faqDir} — terse notes`);
  }
  if (exists(resolution.refDir)) {
    lines.push(`- ${resolution.refDir} — longer refs`);
  }

  if (lines.length === 1) {
    return '';
  }

  lines.push('search them when relevant.');
  return lines.join('\n');
}

function fillFlowTokens(
  template: string,
  resolution: KnowledgeBaseResolution,
  sourcePath: string,
  captureDate: string
): string {
  return replaceSingleBraceTokens(template, {
    KNOWLEDGE_BASE: resolution.knowledgeBase,
    FAQ_DIR: resolution.faqDir,
    REF_DIR: resolution.refDir,
    CAPTURE_DATE: captureDate,
    SOURCE_PATH: sourcePath,
  });
}

function replaceSingleBraceTokens(
  template: string,
  replacements: Record<string, string>
): string {
  return template.replace(
    /\{(SESSION_TARGET|KNOWLEDGE_BASE|FAQ_DIR|REF_DIR|CAPTURE_DATE|SOURCE_PATH|FOCUS|FOCUS_QUERY)\}/g,
    (_token, key: string) => replacements[key] ?? ''
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
