import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateImages } from '../../../src/tools/generate.js';
import type { ImageProvider, GenerateResult } from '../../../src/providers/base.js';
import type { StorageProvider } from '../../../src/storage/base.js';
import type { GenerationStore, Generation } from '../../../src/db/generations.js';
import type { Config } from '../../../src/config/loader.js';

// Mock fs module
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

describe('generateImages', () => {
  let mockProvider: ImageProvider;
  let mockStorage: StorageProvider;
  let mockDb: GenerationStore;
  let mockConfig: Config;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock provider
    mockProvider = {
      name: 'test-provider',
      generate: vi.fn(),
      downloadImage: vi.fn(),
      getCostPerImage: vi.fn(() => 0.01),
      listModels: vi.fn(() => ['model-1', 'model-2']),
    };

    // Create mock storage
    mockStorage = {
      name: 'test-storage',
      upload: vi.fn(),
      delete: vi.fn(),
      healthCheck: vi.fn(() => Promise.resolve(true)),
    };

    // Create mock db
    mockDb = {
      createGeneration: vi.fn(),
      getGeneration: vi.fn(),
      markSelected: vi.fn(),
      listGenerations: vi.fn(),
      getCosts: vi.fn(),
      close: vi.fn(),
    } as unknown as GenerationStore;

    // Create mock config
    mockConfig = {
      provider: {
        name: 'fal',
        api_key: 'test-api-key',
        default_model: 'fal-ai/flux/schnell',
      },
      storage: {
        name: 'local',
        bucket: 'test-bucket',
        public_url_prefix: 'https://example.com/images',
        path_template: '{year}/{month}/{filename}',
        local_preview_dir: '/tmp/previews',
      },
      budget: {
        monthly_limit: 25,
        alert_threshold: 0.8,
        alert_method: 'log',
      },
      defaults: {
        count: 3,
        aspect_ratio: '16:9',
        save_local_backup: false,
        auto_cleanup_days: 30,
      },
      database: {
        path: '/tmp/test.db',
      },
    } as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid prompt generates images', () => {
    it('should generate images with a valid prompt', async () => {
      // Setup mock response
      const mockGenerateResult: GenerateResult = {
        images: [
          {
            index: 0,
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            width: 1024,
            height: 1024,
            seed: 12345,
          },
          {
            index: 1,
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            width: 1024,
            height: 1024,
            seed: 12346,
          },
        ],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.02,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);

      const mockGeneration: Generation = {
        id: 'gen-123',
        prompt: 'a sunset over mountains',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 2,
        aspect_ratio: '16:9',
        cost: 0.02,
        created_at: new Date().toISOString(),
      };

      (mockDb.createGeneration as any).mockResolvedValue(mockGeneration);
      (mockDb.getCosts as any).mockResolvedValue({ total: 1.00, by_provider: {}, by_model: {}, generation_count: 10 });

      const result = await generateImages(
        { prompt: 'a sunset over mountains', count: 2 },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: 'a sunset over mountains',
        negative_prompt: undefined,
        count: 2,
        aspect_ratio: '16:9',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.generation_id).toBe('gen-123');
      expect(responseData.images).toHaveLength(2);
      expect(responseData.cost).toBe(0.02);
      expect(responseData.model_used).toBe('fal-ai/flux/schnell');
    });

    it('should use config defaults when count and aspect_ratio not provided', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [
          { index: 0, url: 'data:image/png;base64,abc=', width: 1024, height: 576 },
          { index: 1, url: 'data:image/png;base64,def=', width: 1024, height: 576 },
          { index: 2, url: 'data:image/png;base64,ghi=', width: 1024, height: 576 },
        ],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.03,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-456', prompt: 'test', model: 'fal', provider: 'fal', count: 3, aspect_ratio: '16:9', cost: 0.03, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      await generateImages(
        { prompt: 'a test prompt' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: 'a test prompt',
        negative_prompt: undefined,
        count: 3, // from config defaults
        aspect_ratio: '16:9', // from config defaults
      });
    });

    it('should pass negative_prompt to provider', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [{ index: 0, url: 'data:image/png;base64,abc=', width: 1024, height: 1024 }],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-789', prompt: 'test', model: 'fal', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      await generateImages(
        { prompt: 'a cat', negative_prompt: 'blurry, low quality', count: 1, aspect_ratio: '1:1' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: 'a cat',
        negative_prompt: 'blurry, low quality',
        count: 1,
        aspect_ratio: '1:1',
      });
    });
  });

  describe('input validation', () => {
    it('should handle provider errors gracefully', async () => {
      (mockProvider.generate as any).mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        generateImages(
          { prompt: 'test prompt' },
          { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('provider is called with correct parameters', () => {
    it('should pass all parameters correctly to provider', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [{ index: 0, url: 'data:image/png;base64,abc=', width: 1024, height: 1024 }],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-test', prompt: 'test', model: 'fal', provider: 'fal', count: 2, aspect_ratio: '4:3', cost: 0.01, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      await generateImages(
        { prompt: 'a landscape', negative_prompt: 'people', count: 2, aspect_ratio: '4:3', context: 'blog header' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockProvider.generate).toHaveBeenCalledTimes(1);
      expect(mockProvider.generate).toHaveBeenCalledWith({
        prompt: 'a landscape',
        negative_prompt: 'people',
        count: 2,
        aspect_ratio: '4:3',
      });
    });
  });

  describe('response format matches MCP spec', () => {
    it('should return content array with text type', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [{ index: 0, url: 'data:image/png;base64,abc=', width: 512, height: 512 }],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-mcp', prompt: 'test', model: 'fal', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      const result = await generateImages(
        { prompt: 'test' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      // Verify response data structure
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('generation_id');
      expect(data).toHaveProperty('images');
      expect(data).toHaveProperty('cost');
      expect(data).toHaveProperty('model_used');
    });

    it('should include budget_warning when threshold exceeded', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [{ index: 0, url: 'data:image/png;base64,abc=', width: 512, height: 512 }],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-budget', prompt: 'test', model: 'fal', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });

      // Set costs above threshold (0.8 * 25 = 20)
      (mockDb.getCosts as any).mockResolvedValue({ total: 22, by_provider: {}, by_model: {}, generation_count: 100 });

      const result = await generateImages(
        { prompt: 'test' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('budget_warning');
      expect(data.budget_warning).toContain('Budget alert');
      expect(data.budget_warning).toContain('88.0%'); // 22/25 = 88%
    });

    it('should not include budget_warning when under threshold', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [{ index: 0, url: 'data:image/png;base64,abc=', width: 512, height: 512 }],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-ok', prompt: 'test', model: 'fal', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });

      // Set costs below threshold (0.8 * 25 = 20)
      (mockDb.getCosts as any).mockResolvedValue({ total: 5, by_provider: {}, by_model: {}, generation_count: 50 });

      const result = await generateImages(
        { prompt: 'test' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.budget_warning).toBeUndefined();
    });
  });

  describe('database storage', () => {
    it('should store generation in database with correct fields', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [
          { index: 0, url: 'data:image/png;base64,abc=', width: 1024, height: 1024, seed: 99999 },
        ],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-db', prompt: 'database test', model: 'fal-ai/flux/schnell', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      await generateImages(
        { prompt: 'database test', context: 'unit test', count: 1, aspect_ratio: '1:1' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockDb.createGeneration).toHaveBeenCalledTimes(1);
      const dbCall = (mockDb.createGeneration as any).mock.calls[0][0];

      expect(dbCall.prompt).toBe('database test');
      expect(dbCall.context).toBe('unit test');
      expect(dbCall.model).toBe('fal-ai/flux/schnell');
      expect(dbCall.provider).toBe('fal');
      expect(dbCall.count).toBe(1);
      expect(dbCall.aspect_ratio).toBe('1:1');
      expect(dbCall.cost).toBe(0.01);
      expect(dbCall.images).toHaveLength(1);
      expect(dbCall.images[0].index_num).toBe(0);
      expect(dbCall.images[0].seed).toBe(99999);
    });
  });

  describe('image format handling', () => {
    it('should handle JPEG images correctly', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [
          { index: 0, url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', width: 1024, height: 1024 },
        ],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-jpg', prompt: 'test', model: 'fal', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      const result = await generateImages(
        { prompt: 'test' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0].text);
      expect(data.images[0].preview_url).toContain('.jpg');
    });

    it('should handle PNG images correctly', async () => {
      const mockGenerateResult: GenerateResult = {
        images: [
          { index: 0, url: 'data:image/png;base64,iVBORw0KGgo=', width: 1024, height: 1024 },
        ],
        model_used: 'fal-ai/flux/schnell',
        cost: 0.01,
        provider: 'fal',
      };

      (mockProvider.generate as any).mockResolvedValue(mockGenerateResult);
      (mockDb.createGeneration as any).mockResolvedValue({ id: 'gen-png', prompt: 'test', model: 'fal', provider: 'fal', count: 1, aspect_ratio: '1:1', cost: 0.01, created_at: new Date().toISOString() });
      (mockDb.getCosts as any).mockResolvedValue({ total: 0, by_provider: {}, by_model: {}, generation_count: 0 });

      const result = await generateImages(
        { prompt: 'test' },
        { provider: mockProvider, storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0].text);
      expect(data.images[0].preview_url).toContain('.png');
    });
  });
});
