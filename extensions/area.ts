import { mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const CONFIG_DISPLAY_PATH = '~/.pi/agent/config/pi-faq.json';

export interface KnowledgeConfig {
  knowledgeBase: string;
}

export interface KnowledgeBaseResolution {
  knowledgeBase: string;
  faqDir: string;
  refDir: string;
  source: 'config';
}

export type KnowledgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface LoadKnowledgeConfigOptions {
  home?: string;
  configPath?: string;
  displayPath?: string;
  readFile?: (path: string, encoding: BufferEncoding) => string;
}

export interface ResolveKnowledgeBaseOptions {
  home?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface EnsureKnowledgeBaseDirsOptions {
  mkdir?: (
    path: string,
    options: { recursive: true }
  ) => unknown;
}

export function knowledgeConfigPath(
  home = process.env.HOME ?? ''
): string {
  return join(home, '.pi', 'agent', 'config', 'pi-faq.json');
}

export function loadKnowledgeConfig(
  options: LoadKnowledgeConfigOptions = {}
): KnowledgeResult<KnowledgeConfig> {
  const home = options.home ?? process.env.HOME ?? '';
  const configPath = options.configPath ?? knowledgeConfigPath(home);
  const displayPath = options.displayPath ?? CONFIG_DISPLAY_PATH;
  const readFile = options.readFile ?? readFileSync;

  let raw: string;
  try {
    raw = readFile(configPath, 'utf-8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        ok: false,
        error:
          `pi-faq config missing at ${displayPath}. ` +
          'Create it with {"knowledgeBase":"~/k/agent"}.',
      };
    }

    return {
      ok: false,
      error:
        `pi-faq could not read config at ${displayPath}: ` +
        messageFromError(error),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error:
        'pi-faq config is invalid JSON: ' +
        messageFromError(error),
    };
  }

  return validateKnowledgeConfig(parsed);
}

export function resolveKnowledgeBase(
  config: KnowledgeConfig,
  options: ResolveKnowledgeBaseOptions = {}
): KnowledgeResult<KnowledgeBaseResolution> {
  const home = options.home ?? process.env.HOME ?? '';
  const configured = config.knowledgeBase;

  let knowledgeBase: string;
  if (configured.startsWith('~/')) {
    knowledgeBase = join(home, configured.slice(2));
  } else if (isAbsolute(configured)) {
    knowledgeBase = configured;
  } else {
    return invalidKnowledgeBasePath();
  }

  if (!isAbsolute(knowledgeBase)) {
    return invalidKnowledgeBasePath();
  }

  return {
    ok: true,
    value: {
      knowledgeBase,
      faqDir: join(knowledgeBase, 'faq'),
      refDir: join(knowledgeBase, 'ref'),
      source: 'config',
    },
  };
}

export function ensureKnowledgeBaseDirs(
  resolution: KnowledgeBaseResolution,
  options: EnsureKnowledgeBaseDirsOptions = {}
): KnowledgeResult<KnowledgeBaseResolution> {
  const mkdir = options.mkdir ?? mkdirSync;

  try {
    mkdir(resolution.faqDir, { recursive: true });
    mkdir(resolution.refDir, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error:
        'pi-faq could not create knowledgebase directories under ' +
        `${resolution.knowledgeBase}: ${messageFromError(error)}`,
    };
  }

  return { ok: true, value: resolution };
}

function validateKnowledgeConfig(
  value: unknown
): KnowledgeResult<KnowledgeConfig> {
  if (!isPlainObject(value)) {
    return missingKnowledgeBase();
  }

  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'knowledgeBase')) {
    return {
      ok: false,
      error: 'pi-faq config only accepts "knowledgeBase".',
    };
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'knowledgeBase')) {
    return missingKnowledgeBase();
  }

  const knowledgeBase = value.knowledgeBase;
  if (typeof knowledgeBase !== 'string') {
    return {
      ok: false,
      error: 'pi-faq config "knowledgeBase" must be a string.',
    };
  }

  return { ok: true, value: { knowledgeBase } };
}

function missingKnowledgeBase(): KnowledgeResult<KnowledgeConfig> {
  return {
    ok: false,
    error: 'pi-faq config requires "knowledgeBase".',
  };
}

function invalidKnowledgeBasePath(): KnowledgeResult<KnowledgeBaseResolution> {
  return {
    ok: false,
    error:
      'pi-faq knowledgeBase must be an absolute path or ' +
      'start with "~/".',
  };
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
