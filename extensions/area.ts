import { dirname, resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';

export interface AreaConfig {
  rootEnvVar?: string;
  rootEnvVarIsFile?: boolean;
}

export interface AreaResolution {
  docRoot: string;
  faqDir: string;
  refDir: string;
  source: string;
}

export interface AreaConfigResult {
  config: AreaConfig;
  found: boolean;
  path: string;
}

export function loadAreaConfig(
  configPath: string
): AreaConfigResult {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return {
      config: JSON.parse(raw) as AreaConfig,
      found: true,
      path: configPath,
    };
  } catch {
    return {
      config: {},
      found: false,
      path: configPath,
    };
  }
}

export function resolveArea(
  workingDir: string,
  config: AreaConfig = {}
): AreaResolution {
  const { rootEnvVar, rootEnvVarIsFile = true } = config;

  let root = workingDir;
  let source = 'cwd';

  if (rootEnvVar) {
    const envVal = process.env[rootEnvVar];
    if (envVal) {
      root = rootEnvVarIsFile
        ? dirname(resolve(envVal))
        : resolve(envVal);
      source = rootEnvVar;
    }
  }

  const docRoot = join(root, 'doc');

  return {
    docRoot,
    faqDir: join(docRoot, 'faq'),
    refDir: join(docRoot, 'ref'),
    source,
  };
}
