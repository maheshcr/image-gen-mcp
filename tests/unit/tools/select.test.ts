import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectImage } from '../../../src/tools/select.js';
import type { StorageProvider, UploadResult } from '../../../src/storage/base.js';
import type { GenerationStore, Generation, GenerationImage } from '../../../src/db/generations.js';
import type { Config } from '../../../src/config/loader.js';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
}));

// Import mocked fs for assertions
import { readFileSync, existsSync, unlinkSync, rmdirSync } from 'fs';

describe('selectImage', () => {
  let mockStorage: StorageProvider;
  let mockDb: GenerationStore;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();

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
        name: 'r2',
        bucket: 'test-bucket',
        public_url_prefix: 'https://images.example.com',
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

    // Setup default fs mocks
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(Buffer.from('fake-image-data'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid selection uploads to storage', () => {
    it('should upload selected image to permanent storage', async () => {
      const mockGeneration: Generation = {
        id: 'gen-123',
        prompt: 'a beautiful landscape',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 3,
        aspect_ratio: '16:9',
        cost: 0.03,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-123', index_num: 0, preview_url: '/tmp/previews/gen-123/0.png', width: 1024, height: 576 },
          { generation_id: 'gen-123', index_num: 1, preview_url: '/tmp/previews/gen-123/1.png', width: 1024, height: 576 },
          { generation_id: 'gen-123', index_num: 2, preview_url: '/tmp/previews/gen-123/2.png', width: 1024, height: 576 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);

      const mockUploadResult: UploadResult = {
        key: '2024/01/a-beautiful-landscape-1234567890.png',
        publicUrl: 'https://images.example.com/2024/01/a-beautiful-landscape-1234567890.png',
        size: 1024000,
      };

      (mockStorage.upload as any).mockResolvedValue(mockUploadResult);
      (mockDb.markSelected as any).mockResolvedValue(undefined);

      const result = await selectImage(
        { generation_id: 'gen-123', index: 1 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledWith({
        buffer: Buffer.from('fake-image-data'),
        filename: expect.stringMatching(/^a-beautiful-landscape-\d+\.png$/),
        contentType: 'image/png',
        metadata: {
          generation_id: 'gen-123',
          prompt: 'a beautiful landscape',
        },
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.permanent_url).toBe(mockUploadResult.publicUrl);
      expect(responseData.storage_key).toBe(mockUploadResult.key);
      expect(responseData.size_bytes).toBe(mockUploadResult.size);
      expect(responseData.markdown).toContain('![');
      expect(responseData.markdown).toContain(mockUploadResult.publicUrl);
    });

    it('should use custom filename when provided', async () => {
      const mockGeneration: Generation = {
        id: 'gen-456',
        prompt: 'test prompt',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-456', index_num: 0, preview_url: '/tmp/previews/gen-456/0.jpg', width: 1024, height: 1024 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: '2024/01/custom-name.jpg',
        publicUrl: 'https://images.example.com/2024/01/custom-name.jpg',
        size: 500000,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);

      await selectImage(
        { generation_id: 'gen-456', index: 0, filename: 'custom-name.jpg' },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'custom-name.jpg',
        })
      );
    });

    it('should mark selection in database', async () => {
      const mockGeneration: Generation = {
        id: 'gen-789',
        prompt: 'test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 2,
        aspect_ratio: '1:1',
        cost: 0.02,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-789', index_num: 0, preview_url: '/tmp/previews/gen-789/0.png', width: 512, height: 512 },
          { generation_id: 'gen-789', index_num: 1, preview_url: '/tmp/previews/gen-789/1.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);

      await selectImage(
        { generation_id: 'gen-789', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockDb.markSelected).toHaveBeenCalledWith(
        'gen-789',
        0,
        'test-key',
        'https://example.com/test.png'
      );
    });
  });

  describe('invalid generation_id error', () => {
    it('should throw error for non-existent generation', async () => {
      (mockDb.getGeneration as any).mockResolvedValue(null);

      await expect(
        selectImage(
          { generation_id: 'non-existent', index: 0 },
          { storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('Generation not found: non-existent');
    });
  });

  describe('invalid index error', () => {
    it('should throw error for index out of bounds', async () => {
      const mockGeneration: Generation = {
        id: 'gen-boundary',
        prompt: 'test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 2,
        aspect_ratio: '1:1',
        cost: 0.02,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-boundary', index_num: 0, preview_url: '/tmp/previews/gen-boundary/0.png', width: 512, height: 512 },
          { generation_id: 'gen-boundary', index_num: 1, preview_url: '/tmp/previews/gen-boundary/1.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);

      await expect(
        selectImage(
          { generation_id: 'gen-boundary', index: 5 },
          { storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('Invalid image index: 5');
    });

    it('should throw error when images array is empty', async () => {
      const mockGeneration: Generation = {
        id: 'gen-empty',
        prompt: 'test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 0,
        aspect_ratio: '1:1',
        cost: 0,
        created_at: new Date().toISOString(),
        images: [],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);

      await expect(
        selectImage(
          { generation_id: 'gen-empty', index: 0 },
          { storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('Invalid image index: 0');
    });

    it('should throw error when images is undefined', async () => {
      const mockGeneration: Generation = {
        id: 'gen-no-images',
        prompt: 'test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        // images intentionally undefined
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);

      await expect(
        selectImage(
          { generation_id: 'gen-no-images', index: 0 },
          { storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('Invalid image index: 0');
    });
  });

  describe('cleanup of unselected images', () => {
    it('should delete all preview files by default (cleanup_others = true)', async () => {
      const mockGeneration: Generation = {
        id: 'gen-cleanup',
        prompt: 'cleanup test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 3,
        aspect_ratio: '16:9',
        cost: 0.03,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-cleanup', index_num: 0, preview_url: '/tmp/previews/gen-cleanup/0.png', width: 1024, height: 576 },
          { generation_id: 'gen-cleanup', index_num: 1, preview_url: '/tmp/previews/gen-cleanup/1.png', width: 1024, height: 576 },
          { generation_id: 'gen-cleanup', index_num: 2, preview_url: '/tmp/previews/gen-cleanup/2.png', width: 1024, height: 576 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      const result = await selectImage(
        { generation_id: 'gen-cleanup', index: 1 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      // All 3 files should be deleted
      expect(unlinkSync).toHaveBeenCalledTimes(3);
      expect(unlinkSync).toHaveBeenCalledWith('/tmp/previews/gen-cleanup/0.png');
      expect(unlinkSync).toHaveBeenCalledWith('/tmp/previews/gen-cleanup/1.png');
      expect(unlinkSync).toHaveBeenCalledWith('/tmp/previews/gen-cleanup/2.png');

      // Should try to remove the directory
      expect(rmdirSync).toHaveBeenCalledWith('/tmp/previews/gen-cleanup');

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.cleanup.deleted_previews).toBe(3);
    });

    it('should only delete selected image when cleanup_others = false', async () => {
      const mockGeneration: Generation = {
        id: 'gen-no-cleanup',
        prompt: 'no cleanup test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 3,
        aspect_ratio: '16:9',
        cost: 0.03,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-no-cleanup', index_num: 0, preview_url: '/tmp/previews/gen-no-cleanup/0.png', width: 1024, height: 576 },
          { generation_id: 'gen-no-cleanup', index_num: 1, preview_url: '/tmp/previews/gen-no-cleanup/1.png', width: 1024, height: 576 },
          { generation_id: 'gen-no-cleanup', index_num: 2, preview_url: '/tmp/previews/gen-no-cleanup/2.png', width: 1024, height: 576 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      const result = await selectImage(
        { generation_id: 'gen-no-cleanup', index: 1, cleanup_others: false },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      // Only the selected image should be deleted
      expect(unlinkSync).toHaveBeenCalledTimes(1);
      expect(unlinkSync).toHaveBeenCalledWith('/tmp/previews/gen-no-cleanup/1.png');

      // Should not try to remove directory when cleanup_others is false
      expect(rmdirSync).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.cleanup.deleted_previews).toBe(1);
      expect(responseData.cleanup.retained_previews).toContain('/tmp/previews/gen-no-cleanup/0.png');
      expect(responseData.cleanup.retained_previews).toContain('/tmp/previews/gen-no-cleanup/2.png');
    });

    it('should handle missing preview files gracefully', async () => {
      const mockGeneration: Generation = {
        id: 'gen-missing',
        prompt: 'missing files test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 2,
        aspect_ratio: '1:1',
        cost: 0.02,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-missing', index_num: 0, preview_url: '/tmp/previews/gen-missing/0.png', width: 512, height: 512 },
          { generation_id: 'gen-missing', index_num: 1, preview_url: '/tmp/previews/gen-missing/1.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);

      // First call for reading selected image returns buffer, subsequent calls for deletion check return false
      (existsSync as any)
        .mockReturnValueOnce(true)  // readLocalImage check
        .mockReturnValueOnce(false) // cleanup check for first image
        .mockReturnValueOnce(false); // cleanup check for second image

      // Should not throw, should handle missing files gracefully
      const result = await selectImage(
        { generation_id: 'gen-missing', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(result.content).toHaveLength(1);
    });

    it('should skip URL paths during cleanup', async () => {
      const mockGeneration: Generation = {
        id: 'gen-urls',
        prompt: 'url test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 2,
        aspect_ratio: '1:1',
        cost: 0.02,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-urls', index_num: 0, preview_url: '/tmp/previews/gen-urls/0.png', width: 512, height: 512 },
          { generation_id: 'gen-urls', index_num: 1, preview_url: 'https://external.com/image.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      await selectImage(
        { generation_id: 'gen-urls', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      // Should only try to delete local file, not URL
      expect(unlinkSync).toHaveBeenCalledTimes(1);
      expect(unlinkSync).toHaveBeenCalledWith('/tmp/previews/gen-urls/0.png');
    });
  });

  describe('response format', () => {
    it('should return MCP-compliant response structure', async () => {
      const mockGeneration: Generation = {
        id: 'gen-mcp',
        prompt: 'mcp test',
        context: 'for blog header',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '16:9',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-mcp', index_num: 0, preview_url: '/tmp/previews/gen-mcp/0.png', width: 1024, height: 576 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: '2024/01/mcp-test.png',
        publicUrl: 'https://images.example.com/2024/01/mcp-test.png',
        size: 500000,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      const result = await selectImage(
        { generation_id: 'gen-mcp', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      // Verify response data
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('permanent_url');
      expect(data).toHaveProperty('storage_key');
      expect(data).toHaveProperty('size_bytes');
      expect(data).toHaveProperty('markdown');
      expect(data).toHaveProperty('cleanup');
    });

    it('should include context in markdown alt text when available', async () => {
      const mockGeneration: Generation = {
        id: 'gen-context',
        prompt: 'a very long prompt that would be truncated normally',
        context: 'hero image',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '16:9',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-context', index_num: 0, preview_url: '/tmp/previews/gen-context/0.png', width: 1024, height: 576 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      const result = await selectImage(
        { generation_id: 'gen-context', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.markdown).toBe('![hero image](https://example.com/test.png)');
    });

    it('should use truncated prompt for alt text when no context', async () => {
      const longPrompt = 'a'.repeat(150);
      const mockGeneration: Generation = {
        id: 'gen-long',
        prompt: longPrompt,
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-long', index_num: 0, preview_url: '/tmp/previews/gen-long/0.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test-key',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      const result = await selectImage(
        { generation_id: 'gen-long', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      const data = JSON.parse(result.content[0].text);
      // Alt text should be truncated to 100 chars
      expect(data.markdown).toContain('![' + 'a'.repeat(100) + '](');
    });
  });

  describe('file type detection', () => {
    it('should detect PNG files correctly', async () => {
      const mockGeneration: Generation = {
        id: 'gen-png',
        prompt: 'png test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-png', index_num: 0, preview_url: '/tmp/previews/gen-png/0.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test.png',
        publicUrl: 'https://example.com/test.png',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      await selectImage(
        { generation_id: 'gen-png', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/png',
        })
      );
    });

    it('should detect JPEG files correctly', async () => {
      const mockGeneration: Generation = {
        id: 'gen-jpg',
        prompt: 'jpg test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-jpg', index_num: 0, preview_url: '/tmp/previews/gen-jpg/0.jpg', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (mockStorage.upload as any).mockResolvedValue({
        key: 'test.jpg',
        publicUrl: 'https://example.com/test.jpg',
        size: 100,
      });
      (mockDb.markSelected as any).mockResolvedValue(undefined);
      (existsSync as any).mockReturnValue(true);

      await selectImage(
        { generation_id: 'gen-jpg', index: 0 },
        { storage: mockStorage, db: mockDb, config: mockConfig }
      );

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/jpeg',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw error when preview file not found for reading', async () => {
      const mockGeneration: Generation = {
        id: 'gen-notfound',
        prompt: 'not found test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-notfound', index_num: 0, preview_url: '/tmp/previews/gen-notfound/0.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (existsSync as any).mockReturnValue(false);

      await expect(
        selectImage(
          { generation_id: 'gen-notfound', index: 0 },
          { storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('Preview file not found: /tmp/previews/gen-notfound/0.png');
    });

    it('should propagate storage upload errors', async () => {
      const mockGeneration: Generation = {
        id: 'gen-upload-fail',
        prompt: 'upload fail test',
        model: 'fal-ai/flux/schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        created_at: new Date().toISOString(),
        images: [
          { generation_id: 'gen-upload-fail', index_num: 0, preview_url: '/tmp/previews/gen-upload-fail/0.png', width: 512, height: 512 },
        ],
      };

      (mockDb.getGeneration as any).mockResolvedValue(mockGeneration);
      (existsSync as any).mockReturnValue(true);
      (mockStorage.upload as any).mockRejectedValue(new Error('Storage quota exceeded'));

      await expect(
        selectImage(
          { generation_id: 'gen-upload-fail', index: 0 },
          { storage: mockStorage, db: mockDb, config: mockConfig }
        )
      ).rejects.toThrow('Storage quota exceeded');
    });
  });
});
