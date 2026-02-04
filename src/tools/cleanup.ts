import { readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { StorageProvider } from '../storage/index.js';
import type { GenerationStore } from '../db/generations.js';
import type { Config } from '../config/loader.js';

interface CleanupArgs {
  older_than_days?: number; // Default: 7 (from config)
  dry_run?: boolean;        // Default: false - just list what would be deleted
}

interface Context {
  storage: StorageProvider;
  db: GenerationStore;
  config: Config;
}

export async function cleanupPreviews(args: CleanupArgs, ctx: Context) {
  const olderThanDays = args.older_than_days ?? ctx.config.defaults.auto_cleanup_days;
  const dryRun = args.dry_run ?? false;

  const previewDir = ctx.config.storage.local_preview_dir;
  if (!previewDir || !existsSync(previewDir)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: 'No preview directory found',
            preview_dir: previewDir,
          }, null, 2),
        },
      ],
    };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  const cutoffTime = cutoffDate.getTime();

  // Find old preview directories
  const previewsToDelete: { path: string; ageDays: number }[] = [];

  try {
    const entries = readdirSync(previewDir);

    for (const entry of entries) {
      // Only process generation directories (gen-*)
      if (!entry.startsWith('gen-')) {
        continue;
      }

      const dirPath = join(previewDir, entry);
      const stats = statSync(dirPath);

      if (stats.isDirectory() && stats.mtimeMs < cutoffTime) {
        const ageDays = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24));
        previewsToDelete.push({ path: dirPath, ageDays });
      }
    }
  } catch (e) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Failed to read preview directory',
            preview_dir: previewDir,
            details: String(e),
          }, null, 2),
        },
      ],
    };
  }

  if (previewsToDelete.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: 'No old previews to clean up',
            cutoff_date: cutoffDate.toISOString(),
            older_than_days: olderThanDays,
          }, null, 2),
        },
      ],
    };
  }

  if (dryRun) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dry_run: true,
            would_delete: previewsToDelete.length,
            cutoff_date: cutoffDate.toISOString(),
            older_than_days: olderThanDays,
            previews: previewsToDelete.slice(0, 20).map(p => ({
              path: p.path,
              age_days: p.ageDays,
            })),
            message: previewsToDelete.length > 20
              ? `...and ${previewsToDelete.length - 20} more`
              : undefined,
          }, null, 2),
        },
      ],
    };
  }

  // Delete preview directories and their contents
  let deletedCount = 0;
  const errors: string[] = [];

  for (const preview of previewsToDelete) {
    try {
      // Delete files in the directory first
      const files = readdirSync(preview.path);
      for (const file of files) {
        unlinkSync(join(preview.path, file));
      }
      // Then remove the directory
      rmdirSync(preview.path);
      deletedCount++;
    } catch (e) {
      errors.push(`${preview.path}: ${String(e)}`);
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          deleted_count: deletedCount,
          cutoff_date: cutoffDate.toISOString(),
          older_than_days: olderThanDays,
          errors: errors.length > 0 ? errors : undefined,
        }, null, 2),
      },
    ],
  };
}
