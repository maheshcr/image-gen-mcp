import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Store original env
const originalEnv = { ...process.env };

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock dotenv
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

// Mock os.homedir to return consistent path
vi.mock('os', () => ({
  homedir: () => '/mock-home',
}));

// Import after mocks are set up
import { loadConfig, getConfigPath, getConfigDir } from '../../../src/config/loader.js';
import { existsSync, mkdirSync } from 'fs';

const FIXTURES_DIR = join(__dirname, '../../fixtures');

// Helper to read actual fixture files
function readFixture(filename: string): string {
  const actualReadFileSync = vi.importActual<typeof import('fs')>('fs').then(
    (m) => m.readFileSync
  );
  // Use the real fs to read fixtures
  const fs = require('fs');
  return fs.readFileSync(join(FIXTURES_DIR, filename), 'utf-8');
}

describe('Config Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getConfigPath', () => {
    it('should return the config file path', () => {
      expect(getConfigPath()).toBe('/mock-home/.config/image-gen-mcp/config.yaml');
    });
  });

  describe('getConfigDir', () => {
    it('should return the config directory path', () => {
      expect(getConfigDir()).toBe('/mock-home/.config/image-gen-mcp');
    });
  });

  describe('loadConfig', () => {
    describe('loading valid config file', () => {
      it('should load and parse a valid config file with all fields', async () => {
        const validConfig = readFixture('valid-config.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(validConfig);

        const config = await loadConfig();

        expect(config.provider.name).toBe('fal');
        expect(config.provider.api_key).toBe('test-api-key-12345');
        expect(config.provider.default_model).toBe('fal-ai/flux/schnell');
        expect(config.storage.name).toBe('r2');
        expect(config.storage.bucket).toBe('test-bucket');
        expect(config.budget.monthly_limit).toBe(25);
        expect(config.budget.alert_threshold).toBe(0.75);
        expect(config.defaults.count).toBe(4);
        expect(config.defaults.aspect_ratio).toBe('1:1');
        expect(config.database.path).toBe('/tmp/test-generations.db');
      });

      it('should load minimal config and apply defaults', async () => {
        const minimalConfig = readFixture('minimal-config.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(minimalConfig);

        const config = await loadConfig();

        // Check specified values
        expect(config.provider.name).toBe('gemini');
        expect(config.provider.api_key).toBe('test-gemini-key');
        expect(config.storage.name).toBe('local');

        // Check defaults are applied
        expect(config.provider.default_model).toBe('fal-ai/flux/schnell');
        expect(config.budget.monthly_limit).toBe(10);
        expect(config.budget.alert_threshold).toBe(0.8);
        expect(config.budget.alert_method).toBe('log');
        expect(config.defaults.count).toBe(3);
        expect(config.defaults.aspect_ratio).toBe('16:9');
        expect(config.defaults.save_local_backup).toBe(false);
        expect(config.defaults.auto_cleanup_days).toBe(30);
        expect(config.storage.path_template).toBe('{year}/{month}/{filename}');
      });
    });

    describe('config file not found', () => {
      it('should throw error when config file does not exist', async () => {
        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return false;
          if (String(path).endsWith('.env')) return false;
          return false;
        });

        await expect(loadConfig()).rejects.toThrow(
          "Config file not found at /mock-home/.config/image-gen-mcp/config.yaml. Run 'image-gen-mcp setup' to configure."
        );
      });
    });

    describe('environment variable resolution', () => {
      it('should resolve environment variables in config values', async () => {
        const configWithEnvVars = readFixture('config-with-env-vars.yaml');

        // Set environment variables
        process.env.FAL_API_KEY = 'resolved-fal-key';
        process.env.R2_ACCESS_KEY = 'resolved-access-key';
        process.env.R2_SECRET_KEY = 'resolved-secret-key';

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(configWithEnvVars);

        const config = await loadConfig();

        expect(config.provider.api_key).toBe('resolved-fal-key');
        expect(config.storage.access_key).toBe('resolved-access-key');
        expect(config.storage.secret_key).toBe('resolved-secret-key');
      });

      it('should throw error when required environment variable is missing', async () => {
        const configWithEnvVars = readFixture('config-with-env-vars.yaml');

        // Ensure env vars are not set
        delete process.env.FAL_API_KEY;
        delete process.env.R2_ACCESS_KEY;
        delete process.env.R2_SECRET_KEY;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(configWithEnvVars);

        await expect(loadConfig()).rejects.toThrow(
          'Environment variable FAL_API_KEY is not set'
        );
      });

      it('should throw error for second missing env var when first is set', async () => {
        const configWithEnvVars = readFixture('config-with-env-vars.yaml');

        // Set only the first env var
        process.env.FAL_API_KEY = 'resolved-fal-key';
        delete process.env.R2_ACCESS_KEY;
        delete process.env.R2_SECRET_KEY;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(configWithEnvVars);

        await expect(loadConfig()).rejects.toThrow(
          'Environment variable R2_ACCESS_KEY is not set'
        );
      });
    });

    describe('default values', () => {
      it('should set default database path when not specified', async () => {
        // Config without database.path
        const configWithoutDbPath = `
provider:
  name: fal
  api_key: test-key

storage:
  name: local
  bucket: test-bucket
  public_url_prefix: http://localhost:3000
`;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(configWithoutDbPath);

        const config = await loadConfig();

        expect(config.database.path).toBe('/mock-home/.config/image-gen-mcp/generations.db');
      });

      it('should set default local_preview_dir when not specified', async () => {
        const minimalConfig = readFixture('minimal-config.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(minimalConfig);

        const config = await loadConfig();

        expect(config.storage.local_preview_dir).toBe('/mock-home/.config/image-gen-mcp/previews');
      });

      it('should expand ~ in local_preview_dir path', async () => {
        const configWithTilde = `
provider:
  name: fal
  api_key: test-key

storage:
  name: local
  bucket: test-bucket
  public_url_prefix: http://localhost:3000
  local_preview_dir: ~/my-images/previews

database:
  path: /tmp/test.db
`;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(configWithTilde);

        const config = await loadConfig();

        expect(config.storage.local_preview_dir).toBe('/mock-home/my-images/previews');
      });

      it('should create config directory if it does not exist', async () => {
        const validConfig = readFixture('valid-config.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return false; // Config dir doesn't exist
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(validConfig);

        await loadConfig();

        expect(mkdirSync).toHaveBeenCalledWith('/mock-home/.config/image-gen-mcp', { recursive: true });
      });
    });

    describe('Zod schema validation', () => {
      it('should reject invalid provider name', async () => {
        const invalidProviderConfig = readFixture('invalid-provider.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(invalidProviderConfig);

        await expect(loadConfig()).rejects.toThrow();
      });

      it('should reject missing required fields (api_key)', async () => {
        const missingRequiredConfig = readFixture('missing-required.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(missingRequiredConfig);

        await expect(loadConfig()).rejects.toThrow();
      });

      it('should reject invalid storage name', async () => {
        const invalidStorageConfig = `
provider:
  name: fal
  api_key: test-key

storage:
  name: invalid-storage
  bucket: test-bucket
  public_url_prefix: http://localhost:3000

database:
  path: /tmp/test.db
`;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(invalidStorageConfig);

        await expect(loadConfig()).rejects.toThrow();
      });

      it('should reject missing storage bucket', async () => {
        const missingBucketConfig = `
provider:
  name: fal
  api_key: test-key

storage:
  name: r2
  public_url_prefix: http://localhost:3000

database:
  path: /tmp/test.db
`;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(missingBucketConfig);

        await expect(loadConfig()).rejects.toThrow();
      });

      it('should reject invalid budget alert_method', async () => {
        const invalidAlertMethodConfig = `
provider:
  name: fal
  api_key: test-key

storage:
  name: local
  bucket: test-bucket
  public_url_prefix: http://localhost:3000

budget:
  alert_method: email

database:
  path: /tmp/test.db
`;

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return false;
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(invalidAlertMethodConfig);

        await expect(loadConfig()).rejects.toThrow();
      });

      it('should accept all valid provider names', async () => {
        const providers = ['gemini', 'fal'];

        for (const providerName of providers) {
          const configYaml = `
provider:
  name: ${providerName}
  api_key: test-key

storage:
  name: local
  bucket: test-bucket
  public_url_prefix: http://localhost:3000

database:
  path: /tmp/test.db
`;

          vi.mocked(existsSync).mockImplementation((path) => {
            if (String(path).endsWith('config.yaml')) return true;
            if (String(path).endsWith('.env')) return false;
            if (String(path).endsWith('image-gen-mcp')) return true;
            return false;
          });

          vi.mocked(readFileSync).mockReturnValue(configYaml);

          const config = await loadConfig();
          expect(config.provider.name).toBe(providerName);
        }
      });

      it('should accept all valid storage names', async () => {
        const storageNames = ['r2', 'local'];

        for (const storageName of storageNames) {
          const configYaml = `
provider:
  name: fal
  api_key: test-key

storage:
  name: ${storageName}
  bucket: test-bucket
  public_url_prefix: http://localhost:3000

database:
  path: /tmp/test.db
`;

          vi.mocked(existsSync).mockImplementation((path) => {
            if (String(path).endsWith('config.yaml')) return true;
            if (String(path).endsWith('.env')) return false;
            if (String(path).endsWith('image-gen-mcp')) return true;
            return false;
          });

          vi.mocked(readFileSync).mockReturnValue(configYaml);

          const config = await loadConfig();
          expect(config.storage.name).toBe(storageName);
        }
      });
    });

    describe('.env file loading', () => {
      it('should load .env file from config directory if it exists', async () => {
        const { config: loadDotenvMock } = await import('dotenv');
        const validConfig = readFixture('valid-config.yaml');

        vi.mocked(existsSync).mockImplementation((path) => {
          if (String(path).endsWith('config.yaml')) return true;
          if (String(path).endsWith('.env')) return true; // .env exists
          if (String(path).endsWith('image-gen-mcp')) return true;
          return false;
        });

        vi.mocked(readFileSync).mockReturnValue(validConfig);

        await loadConfig();

        expect(loadDotenvMock).toHaveBeenCalledWith({
          path: '/mock-home/.config/image-gen-mcp/.env',
          quiet: true,
        });
      });
    });
  });
});
