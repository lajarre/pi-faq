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

export function loadAreaConfig(
  configPath: string
): AreaConfig {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as AreaConfig;
  } catch {
    return {};
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
