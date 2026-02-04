import { GoogleGenAI } from '@google/genai';
import type { ImageProvider, GenerateOptions, GenerateResult, ProviderConfig } from './base.js';

// Model pricing (USD per image) - based on output tokens
// gemini-2.5-flash-image: $0.039/image (1290 tokens @ $30/1M output tokens)
// gemini-3-pro-image: varies by resolution
const MODEL_COSTS: Record<string, number> = {
  'gemini-2.5-flash-image': 0.039,
  'gemini-3-pro-image-preview': 0.10, // ~2K resolution default
};

// Supported aspect ratios for Gemini
const SUPPORTED_ASPECT_RATIOS = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
];

export class GeminiProvider implements ImageProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.api_key });
    this.defaultModel = config.default_model || 'gemini-2.5-flash-image';
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model || this.defaultModel;
    const aspectRatio = SUPPORTED_ASPECT_RATIOS.includes(options.aspect_ratio)
      ? options.aspect_ratio
      : '16:9';

    // Build the prompt
    let prompt = options.prompt;
    if (options.negative_prompt) {
      prompt += `\n\nAvoid: ${options.negative_prompt}`;
    }

    // Generate images sequentially (Gemini returns one image per call)
    const images: Array<{
      index: number;
      url: string;
      width: number;
      height: number;
    }> = [];

    for (let i = 0; i < options.count; i++) {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      });

      // Extract image from response
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          // Create a data URL for the preview
          const mimeType = part.inlineData.mimeType || 'image/png';
          const dataUrl = `data:${mimeType};base64,${part.inlineData.data}`;

          // Estimate dimensions based on aspect ratio
          const dimensions = this.getDimensionsFromAspectRatio(aspectRatio);

          images.push({
            index: i,
            url: dataUrl,
            width: dimensions.width,
            height: dimensions.height,
          });
          break;
        }
      }
    }

    if (images.length === 0) {
      throw new Error('No images generated');
    }

    return {
      images,
      model_used: model,
      cost: this.getCostPerImage(model) * images.length,
      provider: this.name,
    };
  }

  async downloadImage(url: string): Promise<Buffer> {
    // Handle data URLs (base64 encoded images from Gemini)
    if (url.startsWith('data:')) {
      const base64Data = url.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    // Handle regular URLs
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  getCostPerImage(model: string): number {
    return MODEL_COSTS[model] || 0.05;
  }

  listModels(): string[] {
    return Object.keys(MODEL_COSTS);
  }

  private getDimensionsFromAspectRatio(ratio: string): { width: number; height: number } {
    // Default to 1K resolution estimates
    const dimensions: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '2:3': { width: 832, height: 1248 },
      '3:2': { width: 1248, height: 832 },
      '3:4': { width: 896, height: 1152 },
      '4:3': { width: 1152, height: 896 },
      '4:5': { width: 896, height: 1120 },
      '5:4': { width: 1120, height: 896 },
      '9:16': { width: 768, height: 1344 },
      '16:9': { width: 1344, height: 768 },
      '21:9': { width: 1536, height: 640 },
    };
    return dimensions[ratio] || { width: 1024, height: 1024 };
  }
}
