/**
 * Base interface for image generation providers
 */

export interface GenerateOptions {
  prompt: string;
  negative_prompt?: string;
  count: number;
  aspect_ratio: string;
  model?: string;
}

export interface GeneratedImage {
  index: number;
  url: string; // Temporary preview URL
  width: number;
  height: number;
  seed?: number;
}

export interface GenerateResult {
  images: GeneratedImage[];
  model_used: string;
  cost: number;
  provider: string;
}

export interface ProviderConfig {
  name: string;
  api_key: string;
  default_model: string;
  fallback_provider?: string;
}

export interface ImageProvider {
  readonly name: string;

  /**
   * Generate images from a prompt
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * Download an image from a temporary URL
   * Returns the image as a Buffer
   */
  downloadImage(url: string): Promise<Buffer>;

  /**
   * Get the cost per image for a given model
   */
  getCostPerImage(model: string): number;

  /**
   * List available models
   */
  listModels(): string[];
}
