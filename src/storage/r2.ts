import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { StorageProvider, StorageConfig, UploadOptions, UploadResult } from './base.js';
import { generateStoragePath } from './base.js';

export class R2Storage implements StorageProvider {
  readonly name = 'r2';
  private client: S3Client;
  private bucket: string;
  private publicUrlPrefix: string;
  private pathTemplate: string;

  constructor(config: StorageConfig) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.access_key!,
        secretAccessKey: config.secret_key!,
      },
    });
    this.bucket = config.bucket;
    this.publicUrlPrefix = config.public_url_prefix.replace(/\/$/, '');
    this.pathTemplate = config.path_template || '{year}/{month}/{filename}';
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const key = generateStoragePath(this.pathTemplate, options.filename);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: options.buffer,
        ContentType: options.contentType,
        Metadata: options.metadata,
        CacheControl: 'public, max-age=31536000', // 1 year cache
      })
    );

    return {
      key,
      publicUrl: `${this.publicUrlPrefix}/${key}`,
      size: options.buffer.length,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
