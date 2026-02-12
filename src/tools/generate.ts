import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { ImageProvider } from '../providers/index.js';
import type { StorageProvider } from '../storage/index.js';
import type { GenerationStore } from '../db/generations.js';
import type { Config } from '../config/loader.js';

interface GenerateArgs {
  prompt: string;
  negative_prompt?: string;
  count?: number;
  aspect_ratio?: string;
  context?: string;
}

interface Context {
  provider: ImageProvider;
  storage: StorageProvider;
  db: GenerationStore;
  config: Config;
}

/**
 * Extract buffer from a data URL
 */
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  if (!dataUrl.startsWith('data:')) {
    return null;
  }

  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    return null;
  }

  return {
    mimeType: matches[1],
    buffer: Buffer.from(matches[2], 'base64'),
  };
}

export async function generateImages(args: GenerateArgs, ctx: Context) {
  const count = args.count ?? ctx.config.defaults.count;
  const aspect_ratio = args.aspect_ratio ?? ctx.config.defaults.aspect_ratio;

  // Generate images from provider
  const result = await ctx.provider.generate({
    prompt: args.prompt,
    negative_prompt: args.negative_prompt,
    count,
    aspect_ratio,
  });

  // Generate a unique ID for this generation (used for preview folder)
  const generationId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Save previews to local filesystem
  const localPreviewDir = ctx.config.storage.local_preview_dir!;
  const generationDir = join(localPreviewDir, generationId);

  // Ensure preview directory exists
  if (!existsSync(generationDir)) {
    mkdirSync(generationDir, { recursive: true });
  }

  const savedImages: Array<{
    index: number;
    localPath: string;
    width: number;
    height: number;
    seed?: number;
  }> = [];

  for (const img of result.images) {
    // Extract buffer from data URL
    const data = dataUrlToBuffer(img.url);
    if (!data) {
      // If not a data URL, it's already a URL - skip (shouldn't happen with our providers)
      console.error(`Unexpected non-data URL for image ${img.index}`);
      continue;
    }

    // Determine file extension and save locally
    const ext = data.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const localPath = join(generationDir, `${img.index}.${ext}`);

    // Write to local filesystem
    writeFileSync(localPath, data.buffer);

    savedImages.push({
      index: img.index,
      localPath,
      width: img.width,
      height: img.height,
      seed: img.seed,
    });
  }

  // Store in database with local preview paths
  const generation = await ctx.db.createGeneration({
    prompt: args.prompt,
    negative_prompt: args.negative_prompt,
    context: args.context,
    model: result.model_used,
    provider: result.provider,
    count,
    aspect_ratio,
    cost: result.cost,
    images: savedImages.map(img => ({
      generation_id: '', // Will be set by createGeneration
      index_num: img.index,
      preview_url: img.localPath, // Store local path
      width: img.width,
      height: img.height,
      seed: img.seed,
    })),
  });

  // Check budget alert
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const costs = await ctx.db.getCosts(monthStart);

  let budgetWarning: string | undefined;
  if (costs.total >= ctx.config.budget.monthly_limit * ctx.config.budget.alert_threshold) {
    budgetWarning = `Budget alert: ${((costs.total / ctx.config.budget.monthly_limit) * 100).toFixed(1)}% of monthly limit used ($${costs.total.toFixed(2)}/$${ctx.config.budget.monthly_limit})`;
  }

  // Return local file paths for preview
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          generation_id: generation.id,
          images: savedImages.map(img => ({
            index: img.index,
            preview_url: img.localPath,
            width: img.width,
            height: img.height,
          })),
          cost: result.cost,
          model_used: result.model_used,
          budget_warning: budgetWarning,
          _hint: 'Present the preview file paths to the user. Do not describe the images. Ask which one to select.',
        }, null, 2),
      },
    ],
  };
}
