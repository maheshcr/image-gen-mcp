/**
 * Base interface for cloud storage providers
 */

export interface UploadOptions {
  buffer: Buffer;
  filename: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string; // Storage key/path
  publicUrl: string; // Public-facing URL
  size: number;
}

export interface StorageConfig {
  name: string;
  bucket: string;
  endpoint?: string;
  access_key?: string;
  secret_key?: string;
  public_url_prefix: string;
  path_template: string; // e.g., "{year}/{month}/{filename}"
}

export interface StorageProvider {
  readonly name: string;

  /**
   * Upload an image to storage
   */
  upload(options: UploadOptions): Promise<UploadResult>;

  /**
   * Delete an image from storage
   */
  delete(key: string): Promise<void>;

  /**
   * Check if storage is configured and accessible
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Generate storage path from template
 */
export function generateStoragePath(template: string, filename: string): string {
  const now = new Date();
  return template
    .replace('{year}', now.getFullYear().toString())
    .replace('{month}', (now.getMonth() + 1).toString().padStart(2, '0'))
    .replace('{day}', now.getDate().toString().padStart(2, '0'))
    .replace('{filename}', filename);
}
