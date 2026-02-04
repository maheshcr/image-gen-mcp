import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { StorageProvider, StorageConfig, UploadOptions, UploadResult } from './base.js';
import { generateStoragePath } from './base.js';

export class LocalStorage implements StorageProvider {
  readonly name = 'local';
  private basePath: string;
  private publicUrlPrefix: string;
  private pathTemplate: string;

  constructor(config: StorageConfig) {
    this.basePath = config.bucket; // For local, bucket is the base directory path
    this.publicUrlPrefix = config.public_url_prefix || `file://${this.basePath}`;
    this.pathTemplate = config.path_template || '{year}/{month}/{filename}';

    // Ensure base directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const relativePath = generateStoragePath(this.pathTemplate, options.filename);
    const fullPath = join(this.basePath, relativePath);

    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, options.buffer);

    return {
      key: relativePath,
      publicUrl: `${this.publicUrlPrefix}/${relativePath}`,
      size: options.buffer.length,
    };
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.basePath, key);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  async healthCheck(): Promise<boolean> {
    return existsSync(this.basePath);
  }
}
