import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const CONFIG_DIR = join(homedir(), '.config', 'image-gen-mcp');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');
const ENV_FILE = join(CONFIG_DIR, '.env');

export const configureToolDefinition = {
  name: 'configure',
  description: `View or update image-gen-mcp configuration.

Without parameters: shows current config.
With parameters: updates specified settings.

Configurable settings:
- provider: gemini | fal | together | replicate | huggingface
- model: the default model to use
- storage: local | r2 | b2
- budget_limit: monthly budget in USD (0 for unlimited)

After changing provider, you may need to update the API key via the CLI: npx image-gen-mcp setup`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      show: {
        type: 'boolean',
        description: 'Show current configuration (default if no other params)',
      },
      provider: {
        type: 'string',
        enum: ['gemini', 'fal', 'together', 'replicate', 'huggingface'],
        description: 'Switch to a different provider',
      },
      model: {
        type: 'string',
        description: 'Set the default model',
      },
      budget_limit: {
        type: 'number',
        description: 'Set monthly budget limit in USD (0 for unlimited)',
      },
      count: {
        type: 'number',
        description: 'Default number of image variations to generate (1-4)',
      },
      aspect_ratio: {
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '4:3'],
        description: 'Default aspect ratio for generated images',
      },
    },
    additionalProperties: false,
  },
};

interface ConfigureParams {
  show?: boolean;
  provider?: string;
  model?: string;
  budget_limit?: number;
  count?: number;
  aspect_ratio?: string;
}

export async function configureTool(params: ConfigureParams): Promise<string> {
  if (!existsSync(CONFIG_FILE)) {
    return JSON.stringify({
      error: 'No configuration found',
      message: 'Run "npx image-gen-mcp setup" to configure the server.',
    });
  }

  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const config = parseYaml(raw);

  // If only show or no params, return current config
  const hasUpdates = params.provider || params.model ||
                     params.budget_limit !== undefined ||
                     params.count || params.aspect_ratio;

  if (!hasUpdates) {
    // Mask sensitive values
    const safeConfig = {
      provider: {
        name: config.provider?.name,
        model: config.provider?.default_model,
      },
      storage: {
        type: config.storage?.name,
        bucket: config.storage?.bucket,
        public_url: config.storage?.public_url_prefix,
      },
      budget: {
        monthly_limit: config.budget?.monthly_limit || 'unlimited',
        alert_threshold: config.budget?.alert_threshold,
      },
      defaults: config.defaults,
      config_file: CONFIG_FILE,
    };

    return JSON.stringify({
      current_config: safeConfig,
      message: 'To update settings, call configure with the setting you want to change.',
      examples: [
        'configure({ provider: "fal" })',
        'configure({ model: "fal-ai/flux/dev" })',
        'configure({ budget_limit: 20 })',
        'configure({ count: 2, aspect_ratio: "1:1" })',
      ],
    }, null, 2);
  }

  // Apply updates
  const changes: string[] = [];

  if (params.provider) {
    const providerModels: Record<string, string> = {
      gemini: 'gemini-2.0-flash-exp',
      fal: 'fal-ai/flux/schnell',
      together: 'black-forest-labs/FLUX.1-schnell-Free',
      replicate: 'black-forest-labs/flux-schnell',
      huggingface: 'black-forest-labs/FLUX.1-schnell',
    };

    const envVars: Record<string, string> = {
      gemini: 'GOOGLE_API_KEY',
      fal: 'FAL_API_KEY',
      together: 'TOGETHER_API_KEY',
      replicate: 'REPLICATE_API_TOKEN',
      huggingface: 'HF_TOKEN',
    };

    config.provider.name = params.provider;
    config.provider.api_key = `\${${envVars[params.provider]}}`;

    // Update model to provider default if not explicitly set
    if (!params.model) {
      config.provider.default_model = providerModels[params.provider];
      changes.push(`model → ${providerModels[params.provider]}`);
    }

    changes.push(`provider → ${params.provider}`);
  }

  if (params.model) {
    config.provider.default_model = params.model;
    changes.push(`model → ${params.model}`);
  }

  if (params.budget_limit !== undefined) {
    if (!config.budget) config.budget = {};
    config.budget.monthly_limit = params.budget_limit;
    changes.push(`budget_limit → $${params.budget_limit}/month`);
  }

  if (params.count) {
    if (!config.defaults) config.defaults = {};
    config.defaults.count = Math.min(4, Math.max(1, params.count));
    changes.push(`count → ${config.defaults.count}`);
  }

  if (params.aspect_ratio) {
    if (!config.defaults) config.defaults = {};
    config.defaults.aspect_ratio = params.aspect_ratio;
    changes.push(`aspect_ratio → ${params.aspect_ratio}`);
  }

  // Save updated config
  writeFileSync(CONFIG_FILE, stringifyYaml(config), 'utf-8');

  const result: Record<string, any> = {
    success: true,
    changes,
    message: 'Configuration updated. Changes take effect on next generation.',
  };

  // Warn about API key if provider changed
  if (params.provider) {
    const envVars: Record<string, string> = {
      gemini: 'GOOGLE_API_KEY',
      fal: 'FAL_API_KEY',
      together: 'TOGETHER_API_KEY',
      replicate: 'REPLICATE_API_TOKEN',
      huggingface: 'HF_TOKEN',
    };

    result.api_key_reminder = {
      message: `Make sure ${envVars[params.provider]} is set in ${ENV_FILE}`,
      command: 'Run "npx image-gen-mcp setup" to update API key if needed',
    };
  }

  return JSON.stringify(result, null, 2);
}
