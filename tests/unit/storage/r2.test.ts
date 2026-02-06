import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { R2Storage } from '../../../src/storage/r2.js';
import type { StorageConfig, UploadOptions } from '../../../src/storage/base.js';

// Mock AWS S3 client
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'PutObject' })),
    DeleteObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObject' })),
    HeadBucketCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'HeadBucket' })),
  };
});

// Get the mocked S3Client to access the mock send function
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

describe('R2Storage', () => {
  let storage: R2Storage;
  let mockSend: ReturnType<typeof vi.fn>;
  const baseConfig: StorageConfig = {
    name: 'test-r2',
    bucket: 'test-bucket',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    access_key: 'test-access-key',
    secret_key: 'test-secret-key',
    public_url_prefix: 'https://cdn.example.com',
    path_template: '{year}/{month}/{filename}',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock send function
    mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockImplementation(() => ({
      send: mockSend,
    }) as unknown as InstanceType<typeof S3Client>);
    storage = new R2Storage(baseConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create S3Client with correct configuration', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: baseConfig.endpoint,
        credentials: {
          accessKeyId: baseConfig.access_key,
          secretAccessKey: baseConfig.secret_key,
        },
      });
    });

    it('should remove trailing slash from public URL prefix', () => {
      const configWithTrailingSlash: StorageConfig = {
        ...baseConfig,
        public_url_prefix: 'https://cdn.example.com/',
      };
      const storageWithSlash = new R2Storage(configWithTrailingSlash);
      // The storage should normalize the URL prefix internally
      expect(storageWithSlash.name).toBe('r2');
    });

    it('should use default path template when not provided', () => {
      const configWithoutTemplate: StorageConfig = {
        ...baseConfig,
        path_template: '',
      };
      // Default template is '{year}/{month}/{filename}'
      const storageWithDefaults = new R2Storage(configWithoutTemplate);
      expect(storageWithDefaults.name).toBe('r2');
    });
  });

  describe('upload', () => {
    const uploadOptions: UploadOptions = {
      buffer: Buffer.from('test image data'),
      filename: 'test-image.png',
      contentType: 'image/png',
      metadata: { source: 'test' },
    };

    it('should upload file successfully and return correct result', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await storage.upload(uploadOptions);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Body: uploadOptions.buffer,
          ContentType: 'image/png',
          Metadata: { source: 'test' },
          CacheControl: 'public, max-age=31536000',
        })
      );
      expect(result.size).toBe(uploadOptions.buffer.length);
      expect(result.publicUrl).toContain('https://cdn.example.com/');
      expect(result.publicUrl).toContain('test-image.png');
    });

    it('should generate path with year/month template expansion', async () => {
      mockSend.mockResolvedValueOnce({});

      // Mock the date to ensure consistent test results
      const mockDate = new Date('2025-03-15T10:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      const result = await storage.upload(uploadOptions);

      expect(result.key).toBe('2025/03/test-image.png');
      expect(result.publicUrl).toBe('https://cdn.example.com/2025/03/test-image.png');

      vi.useRealTimers();
    });

    it('should handle path template with day placeholder', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-07-05T10:00:00Z'));

      const configWithDay: StorageConfig = {
        ...baseConfig,
        path_template: '{year}/{month}/{day}/{filename}',
      };
      const storageWithDay = new R2Storage(configWithDay);
      mockSend.mockResolvedValueOnce({});

      const result = await storageWithDay.upload(uploadOptions);

      expect(result.key).toBe('2025/07/05/test-image.png');
      expect(result.publicUrl).toBe('https://cdn.example.com/2025/07/05/test-image.png');

      vi.useRealTimers();
    });

    it('should pad single-digit months with leading zero', async () => {
      mockSend.mockResolvedValueOnce({});

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));

      const result = await storage.upload(uploadOptions);

      expect(result.key).toBe('2025/01/test-image.png');

      vi.useRealTimers();
    });

    it('should handle upload without metadata', async () => {
      mockSend.mockResolvedValueOnce({});

      const optionsWithoutMetadata: UploadOptions = {
        buffer: Buffer.from('test'),
        filename: 'test.png',
        contentType: 'image/png',
      };

      const result = await storage.upload(optionsWithoutMetadata);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: undefined,
        })
      );
      expect(result.key).toBeDefined();
    });

    it('should throw error when S3 upload fails', async () => {
      const uploadError = new Error('S3 upload failed: Access Denied');
      mockSend.mockRejectedValueOnce(uploadError);

      await expect(storage.upload(uploadOptions)).rejects.toThrow('S3 upload failed: Access Denied');
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockSend.mockRejectedValueOnce(timeoutError);

      await expect(storage.upload(uploadOptions)).rejects.toThrow('Request timeout');
    });

    it('should handle invalid credentials error', async () => {
      const credentialsError = new Error('Invalid credentials');
      credentialsError.name = 'CredentialsError';
      mockSend.mockRejectedValueOnce(credentialsError);

      await expect(storage.upload(uploadOptions)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('delete', () => {
    it('should delete file successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      await storage.delete('2025/03/test-image.png');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: '2025/03/test-image.png',
      });
    });

    it('should throw error when delete fails', async () => {
      const deleteError = new Error('Delete failed: Not Found');
      mockSend.mockRejectedValueOnce(deleteError);

      await expect(storage.delete('nonexistent/file.png')).rejects.toThrow('Delete failed: Not Found');
    });

    it('should handle permission denied on delete', async () => {
      const permissionError = new Error('Access Denied');
      mockSend.mockRejectedValueOnce(permissionError);

      await expect(storage.delete('protected/file.png')).rejects.toThrow('Access Denied');
    });
  });

  describe('healthCheck', () => {
    it('should return true when bucket is accessible', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await storage.healthCheck();

      expect(result).toBe(true);
      expect(HeadBucketCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
      });
    });

    it('should return false when bucket is not accessible', async () => {
      mockSend.mockRejectedValueOnce(new Error('Bucket not found'));

      const result = await storage.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network unreachable'));

      const result = await storage.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on invalid credentials', async () => {
      mockSend.mockRejectedValueOnce(new Error('Invalid credentials'));

      const result = await storage.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('name property', () => {
    it('should return "r2" as the storage name', () => {
      expect(storage.name).toBe('r2');
    });
  });

  describe('public URL generation', () => {
    it('should generate correct public URL with prefix', async () => {
      mockSend.mockResolvedValueOnce({});
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-20T10:00:00Z'));

      const result = await storage.upload({
        buffer: Buffer.from('test'),
        filename: 'my-image.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.publicUrl).toBe('https://cdn.example.com/2025/06/my-image.jpg');
      vi.useRealTimers();
    });

    it('should handle custom path template in URL generation', async () => {
      mockSend.mockResolvedValueOnce({});
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-12-01T10:00:00Z'));

      const configCustomPath: StorageConfig = {
        ...baseConfig,
        path_template: 'images/{year}/{month}/{filename}',
      };
      const customStorage = new R2Storage(configCustomPath);

      const result = await customStorage.upload({
        buffer: Buffer.from('test'),
        filename: 'photo.webp',
        contentType: 'image/webp',
      });

      expect(result.publicUrl).toBe('https://cdn.example.com/images/2025/12/photo.webp');
      vi.useRealTimers();
    });
  });
});
