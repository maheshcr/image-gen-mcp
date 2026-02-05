#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const CONFIG_DIR = join(homedir(), '.config', 'image-gen-mcp');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

const PROVIDERS = [
  {
    name: 'gemini',
    label: 'Gemini',
    url: 'https://ai.google.dev/',
    envVar: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-2.0-flash-exp'
  },
  {
    name: 'fal',
    label: 'Fal.ai',
    url: 'https://fal.ai/',
    envVar: 'FAL_API_KEY',
    defaultModel: 'fal-ai/flux/schnell'
  },
  {
    name: 'together',
    label: 'Together.ai',
    url: 'https://together.ai/',
    envVar: 'TOGETHER_API_KEY',
    defaultModel: 'black-forest-labs/FLUX.1-schnell-Free'
  },
  {
    name: 'replicate',
    label: 'Replicate',
    url: 'https://replicate.com/',
    envVar: 'REPLICATE_API_TOKEN',
    defaultModel: 'black-forest-labs/flux-schnell'
  },
  {
    name: 'huggingface',
    label: 'HuggingFace',
    url: 'https://huggingface.co/inference-api',
    envVar: 'HF_TOKEN',
    defaultModel: 'black-forest-labs/FLUX.1-schnell'
  },
];

const STORAGE_OPTIONS = [
  {
    name: 'local',
    label: 'Local Storage',
    description: 'Store images locally on this machine'
  },
  {
    name: 'r2',
    label: 'Cloudflare R2',
    url: 'https://developers.cloudflare.com/r2/',
    description: 'S3-compatible cloud storage'
  },
  {
    name: 'b2',
    label: 'Backblaze B2',
    url: 'https://www.backblaze.com/cloud-storage',
    description: 'S3-compatible cloud storage'
  },
];

class SetupWizard {
  private rl: ReturnType<typeof createInterface>;

  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async promptSecret(question: string): Promise<string> {
    // Note: In a real implementation, we'd hide input. For simplicity, showing as-is.
    return this.prompt(question);
  }

  private async selectOption<T extends { name: string; label: string; url?: string }>(
    title: string,
    options: T[]
  ): Promise<T> {
    console.log(`\n${title}`);
    console.log('─'.repeat(40));

    options.forEach((opt, i) => {
      const urlInfo = opt.url ? ` (${opt.url})` : '';
      console.log(`  ${i + 1}. ${opt.label}${urlInfo}`);
    });

    while (true) {
      const answer = await this.prompt(`\nSelect [1-${options.length}]: `);
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        return options[idx];
      }
      console.log('Invalid selection. Please try again.');
    }
  }

  private async confirmOrEdit(value: string, prompt: string): Promise<string> {
    const answer = await this.prompt(`${prompt} [${value}]: `);
    return answer || value;
  }

  async run(): Promise<void> {
    console.log('\n╭─────────────────────────────────────────────────────────╮');
    console.log('│  Image Generation MCP - Setup Wizard                    │');
    console.log('╰─────────────────────────────────────────────────────────╯\n');

    // Check for existing config
    if (existsSync(CONFIG_FILE)) {
      const overwrite = await this.prompt('Config already exists. Overwrite? [y/N]: ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        this.rl.close();
        return;
      }
    }

    // Step 1: Provider
    console.log('\n━━━ Step 1/3: Image Provider ━━━');
    const provider = await this.selectOption('Choose your image generation provider:', PROVIDERS);

    console.log(`\nGet your API key at: ${provider.url}`);
    const apiKey = await this.promptSecret(`Enter your ${provider.label} API key: `);

    if (!apiKey) {
      console.log('API key is required. Setup cancelled.');
      this.rl.close();
      return;
    }

    const defaultModel = await this.confirmOrEdit(
      provider.defaultModel,
      'Default model'
    );

    // Step 2: Storage
    console.log('\n━━━ Step 2/3: Storage ━━━');
    const storage = await this.selectOption('Where should images be stored?', STORAGE_OPTIONS);

    let storageConfig: Record<string, any> = {
      name: storage.name,
    };

    if (storage.name === 'local') {
      const localPath = await this.confirmOrEdit(
        join(CONFIG_DIR, 'images'),
        'Local storage path'
      );
      storageConfig.path = localPath;
      storageConfig.public_url_prefix = `file://${localPath}`;
      storageConfig.bucket = 'local';
    } else {
      // Cloud storage
      console.log(`\nConfigure your ${storage.label} storage:`);
      if (storage.url) {
        console.log(`Documentation: ${storage.url}`);
      }

      storageConfig.bucket = await this.prompt('Bucket name: ');
      storageConfig.endpoint = await this.prompt('Endpoint URL: ');
      storageConfig.access_key = await this.promptSecret('Access key: ');
      storageConfig.secret_key = await this.promptSecret('Secret key: ');
      storageConfig.public_url_prefix = await this.prompt('Public URL prefix (for serving images): ');
      storageConfig.path_template = await this.confirmOrEdit(
        '{year}/{month}/{filename}',
        'Path template'
      );
    }

    // Step 3: Budget (optional)
    console.log('\n━━━ Step 3/3: Budget (Optional) ━━━');
    const setBudget = await this.prompt('Set a monthly budget limit? [y/N]: ');

    let budgetConfig = {
      monthly_limit: 0,
      alert_threshold: 0.8,
      alert_method: 'log' as const,
    };

    if (setBudget.toLowerCase() === 'y') {
      const limit = await this.prompt('Monthly limit in USD (e.g., 10): ');
      budgetConfig.monthly_limit = parseFloat(limit) || 10;
    }

    // Build config
    const config = {
      provider: {
        name: provider.name,
        api_key: `\${${provider.envVar}}`,
        default_model: defaultModel,
      },
      storage: storageConfig,
      budget: budgetConfig,
      defaults: {
        count: 3,
        aspect_ratio: '16:9',
        save_local_backup: false,
        auto_cleanup_days: 30,
      },
    };

    // Save config
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, stringifyYaml(config), 'utf-8');

    // Save API key to .env file
    const envFile = join(CONFIG_DIR, '.env');
    const envContent = `${provider.envVar}=${apiKey}\n`;

    // Append or create .env
    if (existsSync(envFile)) {
      const existing = readFileSync(envFile, 'utf-8');
      // Check if key already exists
      if (existing.includes(`${provider.envVar}=`)) {
        // Replace existing
        const updated = existing.replace(
          new RegExp(`${provider.envVar}=.*`),
          `${provider.envVar}=${apiKey}`
        );
        writeFileSync(envFile, updated, 'utf-8');
      } else {
        writeFileSync(envFile, existing + envContent, 'utf-8');
      }
    } else {
      writeFileSync(envFile, envContent, 'utf-8');
    }

    // Done
    console.log('\n━━━ Setup Complete ━━━\n');
    console.log(`✓ Config saved to: ${CONFIG_FILE}`);
    console.log(`✓ API key saved to: ${envFile}`);
    console.log('\nAdd to Claude Code:');
    console.log(`  claude mcp add image-gen "node ${process.cwd()}/dist/server.js"\n`);
    console.log('Or add to ~/.claude/settings.json manually.\n');
    console.log('To reconfigure later, run: npx image-gen-mcp setup');
    console.log('Or use the configure tool from within Claude Code.\n');

    this.rl.close();
  }
}

async function showConfig(): Promise<void> {
  if (!existsSync(CONFIG_FILE)) {
    console.log('No configuration found. Run: npx image-gen-mcp setup');
    return;
  }

  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const config = parseYaml(raw);

  console.log('\nCurrent Configuration:');
  console.log('─'.repeat(40));
  console.log(`Provider: ${config.provider?.name}`);
  console.log(`Model: ${config.provider?.default_model}`);
  console.log(`Storage: ${config.storage?.name}`);
  if (config.storage?.bucket) {
    console.log(`Bucket: ${config.storage.bucket}`);
  }
  if (config.budget?.monthly_limit) {
    console.log(`Budget: $${config.budget.monthly_limit}/month`);
  }
  console.log(`\nConfig file: ${CONFIG_FILE}`);
}

// Main entry point
const command = process.argv[2];

switch (command) {
  case 'setup':
    new SetupWizard().run().catch(console.error);
    break;
  case 'config':
  case 'show':
    showConfig().catch(console.error);
    break;
  default:
    console.log('Image Generation MCP Server\n');
    console.log('Commands:');
    console.log('  setup    Run the setup wizard');
    console.log('  config   Show current configuration');
    console.log('\nUsage: npx image-gen-mcp <command>');
}
