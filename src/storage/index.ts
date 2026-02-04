import type { StorageProvider, StorageConfig } from './base.js';
import { R2Storage } from './r2.js';
import { LocalStorage } from './local.js';

export type { StorageProvider, StorageConfig, UploadOptions, UploadResult } from './base.js';

export function createStorageFromConfig(config: StorageConfig): StorageProvider {
  switch (config.name) {
    case 'r2':
      return new R2Storage(config);
    case 'local':
      return new LocalStorage(config);
    default:
      throw new Error(`Unknown storage provider: ${config.name}`);
  }
}
