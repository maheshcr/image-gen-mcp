import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureTool } from '../../../src/tools/configure.js';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock yaml module
vi.mock('yaml', () => ({
  parse: vi.fn(),
  stringify: vi.fn((obj) => JSON.stringify(obj, null, 2)),
}));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// Import mocked modules for assertions
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

describe('configureTool', () => {
  const CONFIG_FILE = '/home/testuser/.config/image-gen-mcp/config.yaml';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('show config when no params', () => {
    it('should return current configuration when called with no parameters', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: {
          name: 'fal',
          default_model: 'fal-ai/flux/schnell',
        },
        storage: {
          name: 'r2',
          bucket: 'my-images',
          public_url_prefix: 'https://images.example.com',
        },
        budget: {
          monthly_limit: 25,
          alert_threshold: 0.8,
        },
        defaults: {
          count: 3,
          aspect_ratio: '16:9',
        },
      });

      const result = await configureTool({});
      const data = JSON.parse(result);

      expect(data).toHaveProperty('current_config');
      expect(data.current_config.provider.name).toBe('fal');
      expect(data.current_config.provider.model).toBe('fal-ai/flux/schnell');
      expect(data.current_config.storage.type).toBe('r2');
      expect(data.current_config.budget.monthly_limit).toBe(25);
      expect(data.current_config.defaults.count).toBe(3);
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('examples');
    });

    it('should return config when show=true is explicitly passed', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'gemini', default_model: 'gemini-2.0-flash-exp' },
        storage: { name: 'local', bucket: 'local', public_url_prefix: '/images' },
        budget: { monthly_limit: 10 },
        defaults: { count: 2, aspect_ratio: '1:1' },
      });

      const result = await configureTool({ show: true });
      const data = JSON.parse(result);

      expect(data).toHaveProperty('current_config');
      expect(data.current_config.provider.name).toBe('gemini');
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('should return error when no config file exists', async () => {
      (existsSync as any).mockReturnValue(false);

      const result = await configureTool({});
      const data = JSON.parse(result);

      expect(data).toHaveProperty('error', 'No configuration found');
      expect(data).toHaveProperty('message');
      expect(data.message).toContain('npx image-gen-mcp setup');
    });

    it('should show unlimited for budget when monthly_limit is 0 or not set', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: {}, // no monthly_limit
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({});
      const data = JSON.parse(result);

      expect(data.current_config.budget.monthly_limit).toBe('unlimited');
    });
  });

  describe('update provider', () => {
    it('should update provider to fal', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'gemini', default_model: 'gemini-2.0-flash-exp', api_key: 'old-key' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ provider: 'fal' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('provider \u2192 fal');
      expect(data.changes).toContain('model \u2192 fal-ai/flux/schnell');
      expect(data.api_key_reminder).toBeDefined();
      expect(data.api_key_reminder.message).toContain('FAL_API_KEY');

      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('should update provider to gemini', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell', api_key: 'old-key' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ provider: 'gemini' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('provider \u2192 gemini');
      expect(data.changes).toContain('model \u2192 gemini-2.0-flash-exp');
      expect(data.api_key_reminder.message).toContain('GOOGLE_API_KEY');
    });

    it('should not update model when both provider and model are specified', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'gemini', default_model: 'gemini-2.0-flash-exp', api_key: 'old-key' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ provider: 'fal', model: 'fal-ai/flux/dev' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('provider \u2192 fal');
      expect(data.changes).toContain('model \u2192 fal-ai/flux/dev');
      // Should not contain the default model
      expect(data.changes).not.toContain('model \u2192 fal-ai/flux/schnell');
    });
  });

  describe('update budget', () => {
    it('should update monthly budget limit', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ budget_limit: 50 });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('budget_limit \u2192 $50/month');
      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('should set budget to 0 (unlimited)', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ budget_limit: 0 });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('budget_limit \u2192 $0/month');
    });

    it('should create budget object if it does not exist', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        defaults: { count: 3, aspect_ratio: '16:9' },
        // no budget object
      });

      const result = await configureTool({ budget_limit: 100 });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('budget_limit \u2192 $100/month');
    });
  });

  describe('update defaults (count, aspect_ratio)', () => {
    it('should update default count', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ count: 2 });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('count \u2192 2');
    });

    it('should clamp count to minimum of 1', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ count: -5 });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('count \u2192 1');
    });

    it('should clamp count to maximum of 4', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ count: 10 });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('count \u2192 4');
    });

    it('should update default aspect_ratio', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ aspect_ratio: '1:1' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('aspect_ratio \u2192 1:1');
    });

    it('should update both count and aspect_ratio together', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ count: 4, aspect_ratio: '9:16' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('count \u2192 4');
      expect(data.changes).toContain('aspect_ratio \u2192 9:16');
    });

    it('should create defaults object if it does not exist', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        // no defaults object
      });

      const result = await configureTool({ count: 2, aspect_ratio: '4:3' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('count \u2192 2');
      expect(data.changes).toContain('aspect_ratio \u2192 4:3');
    });
  });

  describe('update model', () => {
    it('should update model independently', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ model: 'fal-ai/flux/dev' });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('model \u2192 fal-ai/flux/dev');
      expect(data.changes).toHaveLength(1); // Only model changed
      expect(data.api_key_reminder).toBeUndefined(); // No API key warning since provider not changed
    });
  });

  describe('error handling for invalid values', () => {
    it('should handle missing config file gracefully', async () => {
      (existsSync as any).mockReturnValue(false);

      const result = await configureTool({ provider: 'fal' });
      const data = JSON.parse(result);

      expect(data).toHaveProperty('error');
      expect(data.error).toBe('No configuration found');
    });
  });

  describe('config file persistence', () => {
    it('should write updated config to file', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      await configureTool({ budget_limit: 100 });

      expect(writeFileSync).toHaveBeenCalledTimes(1);
      expect(writeFileSync).toHaveBeenCalledWith(
        CONFIG_FILE,
        expect.any(String),
        'utf-8'
      );
    });

    it('should not write to file when only viewing config', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      await configureTool({});

      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('multiple updates in single call', () => {
    it('should handle provider, budget, and defaults updates together', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell', api_key: 'old-key' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({
        provider: 'gemini',
        budget_limit: 50,
        count: 2,
        aspect_ratio: '1:1',
      });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(data.changes).toContain('provider \u2192 gemini');
      expect(data.changes).toContain('model \u2192 gemini-2.0-flash-exp');
      expect(data.changes).toContain('budget_limit \u2192 $50/month');
      expect(data.changes).toContain('count \u2192 2');
      expect(data.changes).toContain('aspect_ratio \u2192 1:1');
      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('response message format', () => {
    it('should include success message on update', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({ count: 2 });
      const data = JSON.parse(result);

      expect(data.message).toContain('Configuration updated');
      expect(data.message).toContain('Changes take effect on next generation');
    });

    it('should include config file path when viewing config', async () => {
      (existsSync as any).mockReturnValue(true);
      (parseYaml as any).mockReturnValue({
        provider: { name: 'fal', default_model: 'fal-ai/flux/schnell' },
        storage: { name: 'r2', bucket: 'test', public_url_prefix: 'https://example.com' },
        budget: { monthly_limit: 25 },
        defaults: { count: 3, aspect_ratio: '16:9' },
      });

      const result = await configureTool({});
      const data = JSON.parse(result);

      expect(data.current_config.config_file).toBe(CONFIG_FILE);
    });
  });
});
