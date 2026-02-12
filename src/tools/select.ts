import { readFileSync, existsSync, unlinkSync, rmdirSync } from 'fs';
import { dirname } from 'path';
import type { StorageProvider } from '../storage/index.js';
import { sanitizeForHeader } from '../storage/base.js';
import type { GenerationStore } from '../db/generations.js';
import type { Config } from '../config/loader.js';

interface SelectArgs {
  generation_id: string;
  index: number;
  filename?: string;
  cleanup_others?: boolean; // Default: true - delete unselected preview images
}

interface Context {
  storage: StorageProvider;
  db: GenerationStore;
  config: Config;
}

/**
 * Read image buffer from local file path
 */
function readLocalImage(filePath: string): Buffer {
  if (!existsSync(filePath)) {
    throw new Error(`Preview file not found: ${filePath}`);
  }
  return readFileSync(filePath);
}

/**
 * Check if a path is a local file (not a URL)
 */
function isLocalPath(path: string): boolean {
  return !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:');
}

export async function selectImage(args: SelectArgs, ctx: Context) {
  const cleanupOthers = args.cleanup_others !== false; // Default to true

  // Get generation from database
  const generation = await ctx.db.getGeneration(args.generation_id);
  if (!generation) {
    throw new Error(`Generation not found: ${args.generation_id}`);
  }

  if (!generation.images || args.index >= generation.images.length) {
    throw new Error(`Invalid image index: ${args.index}`);
  }

  const selectedImage = generation.images[args.index];

  // Read image from local preview file
  const buffer = readLocalImage(selectedImage.preview_url);

  // Generate filename
  const slug = generation.prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)
    .replace(/-+$/, '');
  const ext = selectedImage.preview_url.includes('.png') ? 'png' : 'jpg';
  const filename = args.filename || `${slug}-${Date.now()}.${ext}`;

  // Upload to permanent storage location (using path_template)
  // Sanitize prompt for HTTP headers (S3 metadata only allows ASCII)
  const uploadResult = await ctx.storage.upload({
    buffer,
    filename,
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
    metadata: {
      generation_id: args.generation_id,
      prompt: sanitizeForHeader(generation.prompt),
    },
  });

  // Update database
  await ctx.db.markSelected(args.generation_id, args.index, uploadResult.key, uploadResult.publicUrl);

  // Cleanup local preview files
  const deletedPreviews: string[] = [];
  const retainedPreviews: string[] = [];
  let previewDir: string | null = null;

  for (const img of generation.images) {
    // Only handle local file paths
    if (!isLocalPath(img.preview_url)) {
      continue;
    }

    // Track the preview directory for later cleanup
    if (!previewDir) {
      previewDir = dirname(img.preview_url);
    }

    if (cleanupOthers || img.index_num === args.index) {
      // Delete all previews if cleanup requested, or just the selected one
      try {
        if (existsSync(img.preview_url)) {
          unlinkSync(img.preview_url);
          deletedPreviews.push(img.preview_url);
        }
      } catch (e) {
        console.error(`Failed to delete local preview: ${img.preview_url}`, e);
      }
    } else {
      retainedPreviews.push(img.preview_url);
    }
  }

  // Try to remove the preview directory if empty
  if (previewDir && cleanupOthers) {
    try {
      rmdirSync(previewDir);
    } catch (e) {
      // Directory not empty or other error, ignore
    }
  }

  // Generate markdown
  const altText = generation.context || generation.prompt.slice(0, 100);
  const markdown = `![${altText}](${uploadResult.publicUrl})`;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          permanent_url: uploadResult.publicUrl,
          storage_key: uploadResult.key,
          size_bytes: uploadResult.size,
          markdown,
          cleanup: {
            deleted_previews: deletedPreviews.length,
            retained_previews: retainedPreviews,
          },
          _hint: 'Present the permanent_url and markdown to the user. Do not describe the image.',
        }, null, 2),
      },
    ],
  };
}
