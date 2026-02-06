import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalStorage } from '../../../src/storage/local.js';
import type { StorageConfig, UploadOptions } from '../../../src/storage/base.js';

// Mock filesystem operations
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    dirname: actual.dirname,
    join: actual.join,
  };
});

import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';

describe('LocalStorage', () => {
  let storage: LocalStorage;
  const baseConfig: StorageConfig = {
    name: 'test-local',
    bucket: '/var/data/images', // For local storage, bucket is the base directory
    public_url_prefix: 'http://localhost:3000/images',
    path_template: '{year}/{month}/{filename}',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior: directory exists
    vi.mocked(existsSync).mockReturnValue(true);
    storage = new LocalStorage(baseConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use bucket as base path', () => {
      expect(storage.name).toBe('local');
      // Base directory should be checked/created
      expect(existsSync).toHaveBeenCalledWith('/var/data/images');
    });

    it('should create base directory if it does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const newStorage = new LocalStorage(baseConfig);

      expect(mkdirSync).toHaveBeenCalledWith('/var/data/images', { recursive: true });
      expect(newStorage.name).toBe('local');
    });

    it('should not create directory if it already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(mkdirSync).mockClear();

      new LocalStorage(baseConfig);

      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should use default file:// URL prefix when not provided', () => {
      const configWithoutPrefix: StorageConfig = {
        ...baseConfig,
        public_url_prefix: '',
      };
      // When no prefix, it should default to file:// + basePath
      const localStore = new LocalStorage(configWithoutPrefix);
      expect(localStore.name).toBe('local');
    });

    it('should use default path template when not provided', () => {
      const configWithoutTemplate: StorageConfig = {
        ...baseConfig,
        path_template: '',
      };
      const localStore = new LocalStorage(configWithoutTemplate);
      expect(localStore.name).toBe('local');
    });
  });

  describe('upload', () => {
    const uploadOptions: UploadOptions = {
      buffer: Buffer.from('test image data'),
      filename: 'test-image.png',
      contentType: 'image/png',
      metadata: { source: 'test' },
    };

    it('should write file to correct path', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await storage.upload(uploadOptions);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/var/data/images/2025/03/test-image.png',
        uploadOptions.buffer
      );
      expect(result.key).toBe('2025/03/test-image.png');
      expect(result.publicUrl).toBe('http://localhost:3000/images/2025/03/test-image.png');
      expect(result.size).toBe(uploadOptions.buffer.length);
    });

    it('should create directory if it does not exist', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));
      vi.clearAllMocks();
      // Directory for file does not exist, so mkdirSync should be called
      vi.mocked(existsSync).mockReturnValue(false);

      await storage.upload(uploadOptions);

      expect(mkdirSync).toHaveBeenCalledWith('/var/data/images/2025/03', { recursive: true });
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should not recreate directory if it exists', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(mkdirSync).mockClear();

      await storage.upload(uploadOptions);

      // mkdirSync should not be called since directory exists
      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should expand year/month/day in path template', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-07-05T10:00:00Z'));
      vi.mocked(existsSync).mockReturnValue(true);

      const configWithDay: StorageConfig = {
        ...baseConfig,
        path_template: '{year}/{month}/{day}/{filename}',
      };
      const storageWithDay = new LocalStorage(configWithDay);

      const result = await storageWithDay.upload(uploadOptions);

      expect(result.key).toBe('2025/07/05/test-image.png');
      expect(writeFileSync).toHaveBeenCalledWith(
        '/var/data/images/2025/07/05/test-image.png',
        expect.any(Buffer)
      );
    });

    it('should pad single-digit months and days with leading zeros', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-09T10:00:00Z'));
      vi.mocked(existsSync).mockReturnValue(true);

      const configWithDay: StorageConfig = {
        ...baseConfig,
        path_template: '{year}/{month}/{day}/{filename}',
      };
      const storageWithDay = new LocalStorage(configWithDay);

      const result = await storageWithDay.upload(uploadOptions);

      expect(result.key).toBe('2025/01/09/test-image.png');
    });

    it('should throw error on permission denied', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const permissionError = new Error('EACCES: permission denied');
      (permissionError as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw permissionError;
      });

      await expect(storage.upload(uploadOptions)).rejects.toThrow('EACCES: permission denied');
    });

    it('should throw error on disk full', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const diskFullError = new Error('ENOSPC: no space left on device');
      (diskFullError as NodeJS.ErrnoException).code = 'ENOSPC';
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw diskFullError;
      });

      await expect(storage.upload(uploadOptions)).rejects.toThrow('ENOSPC: no space left on device');
    });

    it('should throw error when mkdirSync fails', async () => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false); // directory doesn't exist
      const mkdirError = new Error('EACCES: permission denied');
      vi.mocked(mkdirSync).mockImplementation(() => {
        throw mkdirError;
      });

      await expect(storage.upload(uploadOptions)).rejects.toThrow('EACCES: permission denied');
    });

    it('should handle filenames with special characters', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));
      vi.mocked(existsSync).mockReturnValue(true);

      const specialOptions: UploadOptions = {
        buffer: Buffer.from('test'),
        filename: 'my-image_v2 (1).png',
        contentType: 'image/png',
      };

      const result = await storage.upload(specialOptions);

      expect(result.key).toBe('2025/03/my-image_v2 (1).png');
      expect(writeFileSync).toHaveBeenCalledWith(
        '/var/data/images/2025/03/my-image_v2 (1).png',
        expect.any(Buffer)
      );
    });

    it('should return correct file size', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const testBuffer = Buffer.from('a'.repeat(1024)); // 1KB file

      const result = await storage.upload({
        buffer: testBuffer,
        filename: 'large-file.png',
        contentType: 'image/png',
      });

      expect(result.size).toBe(1024);
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await storage.delete('2025/03/test-image.png');

      expect(existsSync).toHaveBeenCalledWith('/var/data/images/2025/03/test-image.png');
      expect(unlinkSync).toHaveBeenCalledWith('/var/data/images/2025/03/test-image.png');
    });

    it('should not throw when file does not exist', async () => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false); // file doesn't exist

      // Should not throw
      await expect(storage.delete('nonexistent/file.png')).resolves.toBeUndefined();

      // unlinkSync should not be called since file doesn't exist
      expect(unlinkSync).not.toHaveBeenCalled();
    });

    it('should throw error on permission denied during delete', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const permissionError = new Error('EACCES: permission denied');
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw permissionError;
      });

      await expect(storage.delete('protected/file.png')).rejects.toThrow('EACCES: permission denied');
    });
  });

  describe('healthCheck', () => {
    it('should return true when base path exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await storage.healthCheck();

      expect(result).toBe(true);
      expect(existsSync).toHaveBeenCalledWith('/var/data/images');
    });

    it('should return false when base path does not exist', async () => {
      // Constructor check passes, health check fails
      vi.mocked(existsSync)
        .mockReturnValueOnce(true) // constructor
        .mockReturnValueOnce(false); // health check

      storage = new LocalStorage(baseConfig);
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await storage.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('name property', () => {
    it('should return "local" as the storage name', () => {
      expect(storage.name).toBe('local');
    });
  });

  describe('path resolution', () => {
    it('should handle tilde expansion for home directory paths', async () => {
      // Note: The current implementation does NOT expand ~
      // This test documents the current behavior
      vi.mocked(existsSync).mockReturnValue(true);

      const homeConfig: StorageConfig = {
        ...baseConfig,
        bucket: '~/.local/share/images',
      };

      const homeStorage = new LocalStorage(homeConfig);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));

      const result = await homeStorage.upload({
        buffer: Buffer.from('test'),
        filename: 'test.png',
        contentType: 'image/png',
      });

      // Current implementation does NOT expand ~, it uses the path as-is
      expect(writeFileSync).toHaveBeenCalledWith(
        '~/.local/share/images/2025/03/test.png',
        expect.any(Buffer)
      );
      expect(result.key).toBe('2025/03/test.png');
    });

    it('should handle relative paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const relativeConfig: StorageConfig = {
        ...baseConfig,
        bucket: './data/images',
      };

      const relativeStorage = new LocalStorage(relativeConfig);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));

      await relativeStorage.upload({
        buffer: Buffer.from('test'),
        filename: 'test.png',
        contentType: 'image/png',
      });

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('data/images/2025/03/test.png'),
        expect.any(Buffer)
      );
    });

    it('should handle absolute paths correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-15T10:00:00Z'));

      const result = await storage.upload({
        buffer: Buffer.from('test'),
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      });

      expect(writeFileSync).toHaveBeenCalledWith(
        '/var/data/images/2025/03/image.jpg',
        expect.any(Buffer)
      );
      expect(result.publicUrl).toBe('http://localhost:3000/images/2025/03/image.jpg');
    });
  });

  describe('public URL generation', () => {
    it('should generate correct public URL with custom prefix', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-20T10:00:00Z'));

      const result = await storage.upload({
        buffer: Buffer.from('test'),
        filename: 'my-image.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.publicUrl).toBe('http://localhost:3000/images/2025/06/my-image.jpg');
    });

    it('should generate file:// URL when no prefix is configured', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-20T10:00:00Z'));

      const noPrefixConfig: StorageConfig = {
        ...baseConfig,
        public_url_prefix: '',
      };
      const noPrefixStorage = new LocalStorage(noPrefixConfig);

      const result = await noPrefixStorage.upload({
        buffer: Buffer.from('test'),
        filename: 'my-image.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.publicUrl).toBe('file:///var/data/images/2025/06/my-image.jpg');
    });
  });
});
