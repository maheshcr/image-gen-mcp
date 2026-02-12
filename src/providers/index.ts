import type { ImageProvider, ProviderConfig } from './base.js';
import { FalProvider } from './fal.js';
import { GeminiProvider } from './gemini.js';

export type { ImageProvider, ProviderConfig, GenerateOptions, GenerateResult, GeneratedImage } from './base.js';

export function createProviderFromConfig(config: ProviderConfig): ImageProvider {
  switch (config.name) {
    case 'fal':
      return new FalProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}
