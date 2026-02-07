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

/**
 * Sanitize a string for use in HTTP headers (S3 metadata).
 * HTTP headers only allow ASCII characters (RFC 7230).
 * This replaces common unicode characters with ASCII equivalents
 * and strips any remaining non-ASCII characters.
 */
export function sanitizeForHeader(text: string, maxLength: number = 500): string {
  return text
    // Normalize whitespace first (tabs, newlines → spaces)
    .replace(/[\t\n\r]/g, ' ')
    // Replace common unicode characters with ASCII equivalents
    .replace(/[\u2018\u2019]/g, "'")  // Curly single quotes → straight
    .replace(/[\u201C\u201D]/g, '"')  // Curly double quotes → straight
    .replace(/\u2014/g, '--')         // Em dash → double hyphen
    .replace(/\u2013/g, '-')          // En dash → hyphen
    .replace(/\u2026/g, '...')        // Ellipsis → three dots
    .replace(/[\u00A0]/g, ' ')        // Non-breaking space → space
    .replace(/[\u2022\u2023\u25E6]/g, '*')  // Bullets → asterisk
    .replace(/[\u00B7]/g, '-')        // Middle dot → hyphen
    // Strip any remaining non-ASCII characters
    .replace(/[^\x20-\x7E]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    // Truncate to max length
    .slice(0, maxLength);
}
