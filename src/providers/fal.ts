import { fal } from '@fal-ai/client';
import type { ImageProvider, GenerateOptions, GenerateResult, ProviderConfig } from './base.js';

// Model pricing (USD per image)
const MODEL_COSTS: Record<string, number> = {
  'fal-ai/flux/schnell': 0.003,
  'fal-ai/flux/dev': 0.025,
  'fal-ai/flux-pro': 0.05,
  'fal-ai/stable-diffusion-v3-medium': 0.035,
};

// Aspect ratio to dimensions mapping
const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 896 },
  '3:4': { width: 896, height: 1152 },
};

export class FalProvider implements ImageProvider {
  readonly name = 'fal';
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    fal.config({
      credentials: config.api_key,
    });
    this.defaultModel = config.default_model || 'fal-ai/flux/schnell';
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model || this.defaultModel;
    const dimensions = ASPECT_RATIOS[options.aspect_ratio] || ASPECT_RATIOS['16:9'];

    const result = await fal.subscribe(model, {
      input: {
        prompt: options.prompt,
        negative_prompt: options.negative_prompt,
        num_images: options.count,
        image_size: dimensions,
        num_inference_steps: model.includes('schnell') ? 4 : 28,
        guidance_scale: model.includes('schnell') ? 1 : 3.5,
        enable_safety_checker: true,
      },
    }) as any;

    const images = result.data.images.map((img: any, index: number) => ({
      index,
      url: img.url,
      width: img.width || dimensions.width,
      height: img.height || dimensions.height,
      seed: img.seed,
    }));

    return {
      images,
      model_used: model,
      cost: this.getCostPerImage(model) * options.count,
      provider: this.name,
    };
  }

  async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  getCostPerImage(model: string): number {
    return MODEL_COSTS[model] || 0.01;
  }

  listModels(): string[] {
    return Object.keys(MODEL_COSTS);
  }
}
