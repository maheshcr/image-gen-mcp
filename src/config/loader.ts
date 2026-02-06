import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

const ConfigSchema = z.object({
  provider: z.object({
    name: z.enum(['fal', 'replicate', 'together', 'huggingface', 'gemini']),
    api_key: z.string(),
    default_model: z.string().default('fal-ai/flux/schnell'),
    fallback_provider: z.string().optional(),
  }),
  storage: z.object({
    name: z.enum(['r2', 'b2', 'wasabi', 'local']),
    bucket: z.string(),
    endpoint: z.string().optional(),
    access_key: z.string().optional(),
    secret_key: z.string().optional(),
    public_url_prefix: z.string(),
    path_template: z.string().default('{year}/{month}/{filename}'),
    local_preview_dir: z.string().optional(),
  }),
  budget: z.object({
    monthly_limit: z.number().default(10),
    alert_threshold: z.number().default(0.8),
    alert_method: z.enum(['log', 'webhook']).default('log'),
  }).default({}),
  defaults: z.object({
    count: z.number().default(3),
    aspect_ratio: z.string().default('16:9'),
    save_local_backup: z.boolean().default(false),
    auto_cleanup_days: z.number().default(30),
  }).default({}),
  database: z.object({
    path: z.string(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = join(homedir(), '.config', 'image-gen-mcp');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');
const DEFAULT_DB_PATH = join(CONFIG_DIR, 'generations.db');

/**
 * Resolve environment variable references in config values
 */
function resolveEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    const match = obj.match(/^\$\{(\w+)\}$/);
    if (match) {
      const envValue = process.env[match[1]];
      if (!envValue) {
        throw new Error(`Environment variable ${match[1]} is not set`);
      }
      return envValue;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveEnvVars(v)])
    );
  }
  return obj;
}

export async function loadConfig(): Promise<Config> {
  // Load .env from config directory if it exists
  const envPath = join(CONFIG_DIR, '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, quiet: true });
  }

  if (!existsSync(CONFIG_FILE)) {
    throw new Error(
      `Config file not found at ${CONFIG_FILE}. Run 'image-gen-mcp setup' to configure.`
    );
  }

  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const parsed = parseYaml(raw);
  const resolved = resolveEnvVars(parsed);

  // Set default database path if not specified
  if (!resolved.database?.path) {
    resolved.database = { path: DEFAULT_DB_PATH };
  }

  // Set default local preview dir and resolve ~ to home directory
  if (!resolved.storage?.local_preview_dir) {
    resolved.storage.local_preview_dir = join(CONFIG_DIR, 'previews');
  } else if (resolved.storage.local_preview_dir.startsWith('~')) {
    resolved.storage.local_preview_dir = resolved.storage.local_preview_dir.replace('~', homedir());
  }

  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  return ConfigSchema.parse(resolved);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
