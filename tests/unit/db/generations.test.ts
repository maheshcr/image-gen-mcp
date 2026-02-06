/**
 * Unit tests for the SQLite database layer (GenerationStore)
 *
 * Uses in-memory SQLite for fast, isolated tests.
 * Each test starts with a fresh database instance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { SCHEMA } from '../../../src/db/schema.js';

// We'll create a TestableGenerationStore that uses in-memory SQLite
// This avoids file system operations and makes tests faster/isolated

interface Generation {
  id: string;
  prompt: string;
  negative_prompt?: string;
  context?: string;
  model: string;
  provider: string;
  count: number;
  aspect_ratio: string;
  cost: number;
  created_at: string;
  selected_index?: number;
  selected_at?: string;
  storage_key?: string;
  public_url?: string;
  images?: GenerationImage[];
}

interface GenerationImage {
  generation_id: string;
  index_num: number;
  preview_url: string;
  width?: number;
  height?: number;
  seed?: number;
}

interface CostSummary {
  total: number;
  by_provider: Record<string, number>;
  by_model: Record<string, number>;
  generation_count: number;
}

/**
 * In-memory version of GenerationStore for testing
 * Mirrors the production implementation but uses in-memory SQLite
 */
class InMemoryGenerationStore {
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase) {
    this.db = db;
    this.db.run(SCHEMA);
  }

  createGeneration(data: Omit<Generation, 'id' | 'created_at'> & { images: GenerationImage[] }): Generation {
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    this.db.run(`
      INSERT INTO generations (id, prompt, negative_prompt, context, model, provider, count, aspect_ratio, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.prompt,
      data.negative_prompt || null,
      data.context || null,
      data.model,
      data.provider,
      data.count,
      data.aspect_ratio,
      data.cost,
      created_at
    ]);

    for (const img of data.images) {
      this.db.run(`
        INSERT INTO images (generation_id, index_num, preview_url, width, height, seed)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, img.index_num, img.preview_url, img.width ?? null, img.height ?? null, img.seed ?? null]);
    }

    return {
      id,
      ...data,
      created_at,
    };
  }

  getGeneration(id: string): Generation | null {
    const genResult = this.db.exec('SELECT * FROM generations WHERE id = ?', [id]);
    if (genResult.length === 0 || genResult[0].values.length === 0) return null;

    const gen = this.rowToGeneration(genResult[0].columns, genResult[0].values[0]);

    const imgResult = this.db.exec('SELECT * FROM images WHERE generation_id = ? ORDER BY index_num', [id]);
    if (imgResult.length > 0) {
      gen.images = imgResult[0].values.map(row => this.rowToImage(imgResult[0].columns, row));
    }

    return gen;
  }

  markSelected(id: string, index: number, storageKey: string, publicUrl: string): void {
    this.db.run(`
      UPDATE generations
      SET selected_index = ?, selected_at = ?, storage_key = ?, public_url = ?
      WHERE id = ?
    `, [index, new Date().toISOString(), storageKey, publicUrl, id]);
  }

  listGenerations(limit: number = 10): Generation[] {
    const genResult = this.db.exec(`
      SELECT * FROM generations
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    if (genResult.length === 0) return [];

    return genResult[0].values.map(row => {
      const gen = this.rowToGeneration(genResult[0].columns, row);
      const imgResult = this.db.exec('SELECT * FROM images WHERE generation_id = ? ORDER BY index_num', [gen.id]);
      if (imgResult.length > 0) {
        gen.images = imgResult[0].values.map(imgRow => this.rowToImage(imgResult[0].columns, imgRow));
      }
      return gen;
    });
  }

  getCosts(since?: Date): CostSummary {
    const whereClause = since ? 'WHERE created_at >= ?' : '';
    const params = since ? [since.toISOString()] : [];

    const totalResult = this.db.exec(`
      SELECT COALESCE(SUM(cost), 0) as total, COUNT(*) as count
      FROM generations ${whereClause}
    `, params);

    const total = totalResult.length > 0 ? {
      total: totalResult[0].values[0][0] as number,
      count: totalResult[0].values[0][1] as number
    } : { total: 0, count: 0 };

    const providerResult = this.db.exec(`
      SELECT provider, SUM(cost) as total
      FROM generations ${whereClause}
      GROUP BY provider
    `, params);

    const modelResult = this.db.exec(`
      SELECT model, SUM(cost) as total
      FROM generations ${whereClause}
      GROUP BY model
    `, params);

    const by_provider: Record<string, number> = {};
    if (providerResult.length > 0) {
      for (const row of providerResult[0].values) {
        by_provider[row[0] as string] = row[1] as number;
      }
    }

    const by_model: Record<string, number> = {};
    if (modelResult.length > 0) {
      for (const row of modelResult[0].values) {
        by_model[row[0] as string] = row[1] as number;
      }
    }

    return {
      total: total.total,
      generation_count: total.count,
      by_provider,
      by_model,
    };
  }

  /**
   * Delete a generation and its associated images
   */
  deleteGeneration(id: string): boolean {
    const gen = this.getGeneration(id);
    if (!gen) return false;

    this.db.run('DELETE FROM images WHERE generation_id = ?', [id]);
    this.db.run('DELETE FROM generations WHERE id = ?', [id]);
    return true;
  }

  /**
   * Cleanup old unselected generations
   * @param olderThan Delete generations older than this date
   * @returns Number of generations deleted
   */
  cleanupOldUnselected(olderThan: Date): number {
    // Get count of generations to delete
    const countResult = this.db.exec(`
      SELECT COUNT(*) FROM generations
      WHERE selected_index IS NULL AND created_at < ?
    `, [olderThan.toISOString()]);

    const count = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

    if (count > 0) {
      // Delete associated images first
      this.db.run(`
        DELETE FROM images WHERE generation_id IN (
          SELECT id FROM generations
          WHERE selected_index IS NULL AND created_at < ?
        )
      `, [olderThan.toISOString()]);

      // Delete generations
      this.db.run(`
        DELETE FROM generations
        WHERE selected_index IS NULL AND created_at < ?
      `, [olderThan.toISOString()]);
    }

    return count;
  }

  private rowToGeneration(columns: string[], values: unknown[]): Generation {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj as unknown as Generation;
  }

  private rowToImage(columns: string[], values: unknown[]): GenerationImage {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj as unknown as GenerationImage;
  }

  close(): void {
    this.db.close();
  }
}

describe('GenerationStore - Database Layer', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;
  let db: SqlJsDatabase;
  let store: InMemoryGenerationStore;

  beforeEach(async () => {
    // Initialize sql.js once (cached)
    if (!SQL) {
      SQL = await initSqlJs();
    }
    // Create fresh in-memory database for each test
    db = new SQL.Database();
    store = new InMemoryGenerationStore(db);
  });

  afterEach(() => {
    store.close();
  });

  describe('Database Initialization', () => {
    it('should create generations table with correct columns', () => {
      const result = db.exec("PRAGMA table_info(generations)");
      expect(result.length).toBe(1);

      const columns = result[0].values.map(row => row[1]);
      expect(columns).toContain('id');
      expect(columns).toContain('prompt');
      expect(columns).toContain('negative_prompt');
      expect(columns).toContain('context');
      expect(columns).toContain('model');
      expect(columns).toContain('provider');
      expect(columns).toContain('count');
      expect(columns).toContain('aspect_ratio');
      expect(columns).toContain('cost');
      expect(columns).toContain('created_at');
      expect(columns).toContain('selected_index');
      expect(columns).toContain('selected_at');
      expect(columns).toContain('storage_key');
      expect(columns).toContain('public_url');
    });

    it('should create images table with correct columns', () => {
      const result = db.exec("PRAGMA table_info(images)");
      expect(result.length).toBe(1);

      const columns = result[0].values.map(row => row[1]);
      expect(columns).toContain('id');
      expect(columns).toContain('generation_id');
      expect(columns).toContain('index_num');
      expect(columns).toContain('preview_url');
      expect(columns).toContain('width');
      expect(columns).toContain('height');
      expect(columns).toContain('seed');
    });

    it('should create indexes on generations table', () => {
      const result = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='generations'");
      expect(result.length).toBe(1);

      const indexNames = result[0].values.map(row => row[0]);
      expect(indexNames).toContain('idx_generations_created');
      expect(indexNames).toContain('idx_generations_selected');
    });

    it('should create index on images table', () => {
      const result = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='images'");
      expect(result.length).toBe(1);

      const indexNames = result[0].values.map(row => row[0]);
      expect(indexNames).toContain('idx_images_generation');
    });

    it('should be idempotent - running schema twice should not error', () => {
      // Schema already ran in beforeEach, run it again
      expect(() => db.run(SCHEMA)).not.toThrow();
    });
  });

  describe('createGeneration', () => {
    it('should create a generation record with all fields', () => {
      const data = {
        prompt: 'A beautiful sunset over mountains',
        negative_prompt: 'blurry, low quality',
        context: 'blog header image',
        model: 'flux-pro',
        provider: 'fal',
        count: 3,
        aspect_ratio: '16:9',
        cost: 0.05,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://example.com/img0.jpg', width: 1024, height: 576, seed: 12345 },
          { generation_id: '', index_num: 1, preview_url: 'https://example.com/img1.jpg', width: 1024, height: 576, seed: 12346 },
          { generation_id: '', index_num: 2, preview_url: 'https://example.com/img2.jpg', width: 1024, height: 576, seed: 12347 },
        ]
      };

      const result = store.createGeneration(data);

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(result.prompt).toBe(data.prompt);
      expect(result.negative_prompt).toBe(data.negative_prompt);
      expect(result.context).toBe(data.context);
      expect(result.model).toBe(data.model);
      expect(result.provider).toBe(data.provider);
      expect(result.count).toBe(data.count);
      expect(result.aspect_ratio).toBe(data.aspect_ratio);
      expect(result.cost).toBe(data.cost);
      expect(result.created_at).toBeDefined();
      expect(new Date(result.created_at).getTime()).not.toBeNaN();
    });

    it('should create a generation with minimal required fields', () => {
      const data = {
        prompt: 'Simple test image',
        model: 'gemini-imagen',
        provider: 'google',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.02,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://example.com/img.jpg' }
        ]
      };

      const result = store.createGeneration(data);

      expect(result.id).toBeDefined();
      expect(result.prompt).toBe(data.prompt);
      expect(result.negative_prompt).toBeUndefined();
      expect(result.context).toBeUndefined();
    });

    it('should store associated images', () => {
      const data = {
        prompt: 'Test with images',
        model: 'flux-schnell',
        provider: 'replicate',
        count: 2,
        aspect_ratio: '4:3',
        cost: 0.03,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://example.com/a.jpg', width: 800, height: 600, seed: 111 },
          { generation_id: '', index_num: 1, preview_url: 'https://example.com/b.jpg', width: 800, height: 600, seed: 222 },
        ]
      };

      const result = store.createGeneration(data);
      const retrieved = store.getGeneration(result.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.images).toHaveLength(2);
      expect(retrieved!.images![0].preview_url).toBe('https://example.com/a.jpg');
      expect(retrieved!.images![0].seed).toBe(111);
      expect(retrieved!.images![1].preview_url).toBe('https://example.com/b.jpg');
      expect(retrieved!.images![1].seed).toBe(222);
    });

    it('should generate unique IDs for each generation', () => {
      const data = {
        prompt: 'Test',
        model: 'test-model',
        provider: 'test-provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      const result1 = store.createGeneration(data);
      const result2 = store.createGeneration(data);
      const result3 = store.createGeneration(data);

      expect(result1.id).not.toBe(result2.id);
      expect(result2.id).not.toBe(result3.id);
      expect(result1.id).not.toBe(result3.id);
    });
  });

  describe('getGeneration', () => {
    it('should retrieve a generation by ID', () => {
      const data = {
        prompt: 'Retrievable image',
        model: 'test-model',
        provider: 'test-provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.prompt).toBe(data.prompt);
    });

    it('should return null for non-existent ID', () => {
      const result = store.getGeneration('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return null for empty string ID', () => {
      const result = store.getGeneration('');
      expect(result).toBeNull();
    });

    it('should include images in the retrieved generation', () => {
      const data = {
        prompt: 'With images',
        model: 'model',
        provider: 'provider',
        count: 3,
        aspect_ratio: '16:9',
        cost: 0.05,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://a.com/0.jpg' },
          { generation_id: '', index_num: 1, preview_url: 'https://a.com/1.jpg' },
          { generation_id: '', index_num: 2, preview_url: 'https://a.com/2.jpg' },
        ]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved!.images).toBeDefined();
      expect(retrieved!.images).toHaveLength(3);
      expect(retrieved!.images![0].index_num).toBe(0);
      expect(retrieved!.images![1].index_num).toBe(1);
      expect(retrieved!.images![2].index_num).toBe(2);
    });

    it('should return images in order by index_num', () => {
      const data = {
        prompt: 'Ordered images',
        model: 'model',
        provider: 'provider',
        count: 3,
        aspect_ratio: '1:1',
        cost: 0.03,
        images: [
          { generation_id: '', index_num: 2, preview_url: 'https://a.com/2.jpg' },
          { generation_id: '', index_num: 0, preview_url: 'https://a.com/0.jpg' },
          { generation_id: '', index_num: 1, preview_url: 'https://a.com/1.jpg' },
        ]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved!.images![0].index_num).toBe(0);
      expect(retrieved!.images![1].index_num).toBe(1);
      expect(retrieved!.images![2].index_num).toBe(2);
    });
  });

  describe('listGenerations', () => {
    it('should return empty array when no generations exist', () => {
      const result = store.listGenerations();
      expect(result).toEqual([]);
    });

    it('should return generations in descending order by created_at', async () => {
      const baseData = {
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      // Create with slight delay to ensure different timestamps
      store.createGeneration({ ...baseData, prompt: 'First' });
      await new Promise(resolve => setTimeout(resolve, 10));
      store.createGeneration({ ...baseData, prompt: 'Second' });
      await new Promise(resolve => setTimeout(resolve, 10));
      store.createGeneration({ ...baseData, prompt: 'Third' });

      const result = store.listGenerations();

      expect(result).toHaveLength(3);
      expect(result[0].prompt).toBe('Third');  // Most recent first
      expect(result[1].prompt).toBe('Second');
      expect(result[2].prompt).toBe('First');
    });

    it('should respect the limit parameter', () => {
      const baseData = {
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      for (let i = 0; i < 15; i++) {
        store.createGeneration({ ...baseData, prompt: `Generation ${i}` });
      }

      const resultDefault = store.listGenerations();
      expect(resultDefault).toHaveLength(10); // Default limit

      const result5 = store.listGenerations(5);
      expect(result5).toHaveLength(5);

      const result20 = store.listGenerations(20);
      expect(result20).toHaveLength(15); // Only 15 exist
    });

    it('should include images for each generation', () => {
      store.createGeneration({
        prompt: 'Gen 1',
        model: 'model',
        provider: 'provider',
        count: 2,
        aspect_ratio: '1:1',
        cost: 0.02,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://a.com/0.jpg' },
          { generation_id: '', index_num: 1, preview_url: 'https://a.com/1.jpg' },
        ]
      });

      store.createGeneration({
        prompt: 'Gen 2',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://b.com/0.jpg' },
        ]
      });

      const result = store.listGenerations();

      expect(result[0].images).toHaveLength(1);
      expect(result[1].images).toHaveLength(2);
    });
  });

  describe('markSelected (update generation)', () => {
    it('should update generation with selection details', () => {
      const created = store.createGeneration({
        prompt: 'To be selected',
        model: 'model',
        provider: 'provider',
        count: 3,
        aspect_ratio: '1:1',
        cost: 0.03,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://a.com/0.jpg' },
          { generation_id: '', index_num: 1, preview_url: 'https://a.com/1.jpg' },
          { generation_id: '', index_num: 2, preview_url: 'https://a.com/2.jpg' },
        ]
      });

      expect(created.selected_index).toBeUndefined();
      expect(created.selected_at).toBeUndefined();

      store.markSelected(created.id, 1, 'storage/key/image.jpg', 'https://cdn.example.com/image.jpg');

      const updated = store.getGeneration(created.id);

      expect(updated!.selected_index).toBe(1);
      expect(updated!.selected_at).toBeDefined();
      expect(new Date(updated!.selected_at!).getTime()).not.toBeNaN();
      expect(updated!.storage_key).toBe('storage/key/image.jpg');
      expect(updated!.public_url).toBe('https://cdn.example.com/image.jpg');
    });

    it('should allow updating selection for the same generation', () => {
      const created = store.createGeneration({
        prompt: 'Multi-select test',
        model: 'model',
        provider: 'provider',
        count: 3,
        aspect_ratio: '1:1',
        cost: 0.03,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://a.com/0.jpg' },
          { generation_id: '', index_num: 1, preview_url: 'https://a.com/1.jpg' },
          { generation_id: '', index_num: 2, preview_url: 'https://a.com/2.jpg' },
        ]
      });

      store.markSelected(created.id, 0, 'key1', 'url1');
      let updated = store.getGeneration(created.id);
      expect(updated!.selected_index).toBe(0);

      store.markSelected(created.id, 2, 'key2', 'url2');
      updated = store.getGeneration(created.id);
      expect(updated!.selected_index).toBe(2);
      expect(updated!.storage_key).toBe('key2');
      expect(updated!.public_url).toBe('url2');
    });

    it('should not throw for non-existent generation ID', () => {
      // The current implementation does not throw, it just updates 0 rows
      expect(() => {
        store.markSelected('non-existent-id', 0, 'key', 'url');
      }).not.toThrow();
    });
  });

  describe('deleteGeneration', () => {
    it('should delete a generation and return true', () => {
      const created = store.createGeneration({
        prompt: 'To be deleted',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      });

      const result = store.deleteGeneration(created.id);

      expect(result).toBe(true);
      expect(store.getGeneration(created.id)).toBeNull();
    });

    it('should delete associated images', () => {
      const created = store.createGeneration({
        prompt: 'Delete with images',
        model: 'model',
        provider: 'provider',
        count: 3,
        aspect_ratio: '1:1',
        cost: 0.03,
        images: [
          { generation_id: '', index_num: 0, preview_url: 'https://a.com/0.jpg' },
          { generation_id: '', index_num: 1, preview_url: 'https://a.com/1.jpg' },
          { generation_id: '', index_num: 2, preview_url: 'https://a.com/2.jpg' },
        ]
      });

      store.deleteGeneration(created.id);

      // Verify images are deleted
      const imgResult = db.exec('SELECT COUNT(*) FROM images WHERE generation_id = ?', [created.id]);
      expect(imgResult[0].values[0][0]).toBe(0);
    });

    it('should return false for non-existent ID', () => {
      const result = store.deleteGeneration('non-existent-id');
      expect(result).toBe(false);
    });

    it('should not affect other generations', () => {
      const gen1 = store.createGeneration({
        prompt: 'Keep this one',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/keep.jpg' }]
      });

      const gen2 = store.createGeneration({
        prompt: 'Delete this one',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/delete.jpg' }]
      });

      store.deleteGeneration(gen2.id);

      const remaining = store.listGenerations();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(gen1.id);
    });
  });

  describe('getCosts - Cost Aggregation', () => {
    it('should return zero totals when no generations exist', () => {
      const costs = store.getCosts();

      expect(costs.total).toBe(0);
      expect(costs.generation_count).toBe(0);
      expect(costs.by_provider).toEqual({});
      expect(costs.by_model).toEqual({});
    });

    it('should calculate total cost across all generations', () => {
      store.createGeneration({
        prompt: 'Gen 1',
        model: 'flux-pro',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.05,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/1.jpg' }]
      });

      store.createGeneration({
        prompt: 'Gen 2',
        model: 'gemini-imagen',
        provider: 'google',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.02,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/2.jpg' }]
      });

      store.createGeneration({
        prompt: 'Gen 3',
        model: 'flux-schnell',
        provider: 'replicate',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.03,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/3.jpg' }]
      });

      const costs = store.getCosts();

      expect(costs.total).toBeCloseTo(0.10, 2);
      expect(costs.generation_count).toBe(3);
    });

    it('should aggregate costs by provider', () => {
      store.createGeneration({
        prompt: 'Fal 1',
        model: 'flux-pro',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.05,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/1.jpg' }]
      });

      store.createGeneration({
        prompt: 'Fal 2',
        model: 'flux-schnell',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.03,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/2.jpg' }]
      });

      store.createGeneration({
        prompt: 'Google',
        model: 'gemini-imagen',
        provider: 'google',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.02,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/3.jpg' }]
      });

      const costs = store.getCosts();

      expect(costs.by_provider['fal']).toBeCloseTo(0.08, 2);
      expect(costs.by_provider['google']).toBeCloseTo(0.02, 2);
    });

    it('should aggregate costs by model', () => {
      store.createGeneration({
        prompt: 'Flux Pro 1',
        model: 'flux-pro',
        provider: 'fal',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.05,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/1.jpg' }]
      });

      store.createGeneration({
        prompt: 'Flux Pro 2',
        model: 'flux-pro',
        provider: 'replicate',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.06,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/2.jpg' }]
      });

      store.createGeneration({
        prompt: 'Gemini',
        model: 'gemini-imagen',
        provider: 'google',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.02,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/3.jpg' }]
      });

      const costs = store.getCosts();

      expect(costs.by_model['flux-pro']).toBeCloseTo(0.11, 2);
      expect(costs.by_model['gemini-imagen']).toBeCloseTo(0.02, 2);
    });

    describe('cost filtering by period', () => {
      beforeEach(() => {
        // We'll manually insert records with specific dates for period testing
        // Use fixed offsets to ensure predictable filtering behavior
        const now = new Date();
        const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

        // Insert directly to control created_at timestamps
        const insertGen = (id: string, prompt: string, cost: number, createdAt: Date) => {
          db.run(`
            INSERT INTO generations (id, prompt, model, provider, count, aspect_ratio, cost, created_at)
            VALUES (?, ?, 'model', 'provider', 1, '1:1', ?, ?)
          `, [id, prompt, cost, createdAt.toISOString()]);
        };

        // Create records at clear intervals
        insertGen('now-1', 'Just now gen', 0.10, now);                    // 0 hours ago
        insertGen('12h-1', '12 hours ago gen', 0.08, hoursAgo(12));       // 12 hours ago
        insertGen('3days-1', '3 days ago gen', 0.05, hoursAgo(72));       // 3 days ago
        insertGen('10days-1', '10 days ago gen', 0.03, hoursAgo(240));    // 10 days ago
        insertGen('45days-1', '45 days ago gen', 0.02, hoursAgo(1080));   // 45 days ago
      });

      it('should filter costs by day (last 24 hours)', () => {
        // Records within 24 hours: now + 12h ago = 2 records
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const costs = store.getCosts(oneDayAgo);

        expect(costs.generation_count).toBe(2);
        expect(costs.total).toBeCloseTo(0.18, 2); // 0.10 + 0.08
      });

      it('should filter costs by week (last 7 days)', () => {
        // Records within 7 days: now + 12h + 3days = 3 records
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const costs = store.getCosts(oneWeekAgo);

        expect(costs.generation_count).toBe(3);
        expect(costs.total).toBeCloseTo(0.23, 2); // 0.10 + 0.08 + 0.05
      });

      it('should filter costs by month (last 30 days)', () => {
        // Records within 30 days: now + 12h + 3days + 10days = 4 records
        const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const costs = store.getCosts(oneMonthAgo);

        expect(costs.generation_count).toBe(4);
        expect(costs.total).toBeCloseTo(0.26, 2); // 0.10 + 0.08 + 0.05 + 0.03
      });

      it('should return all costs when no date filter provided', () => {
        const costs = store.getCosts();

        expect(costs.generation_count).toBe(5);
        expect(costs.total).toBeCloseTo(0.28, 2); // 0.10 + 0.08 + 0.05 + 0.03 + 0.02
      });
    });
  });

  describe('cleanupOldUnselected', () => {
    it('should delete old unselected generations', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Insert old unselected generation
      db.run(`
        INSERT INTO generations (id, prompt, model, provider, count, aspect_ratio, cost, created_at)
        VALUES ('old-unselected', 'Old one', 'model', 'provider', 1, '1:1', 0.01, ?)
      `, [threeDaysAgo.toISOString()]);

      db.run(`
        INSERT INTO images (generation_id, index_num, preview_url)
        VALUES ('old-unselected', 0, 'https://old.com/img.jpg')
      `);

      // Insert recent unselected generation
      store.createGeneration({
        prompt: 'Recent one',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://recent.com/img.jpg' }]
      });

      const deleted = store.cleanupOldUnselected(twoDaysAgo);

      expect(deleted).toBe(1);

      const remaining = store.listGenerations();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].prompt).toBe('Recent one');
    });

    it('should not delete selected generations even if old', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Insert old selected generation
      db.run(`
        INSERT INTO generations (id, prompt, model, provider, count, aspect_ratio, cost, created_at, selected_index, selected_at, storage_key, public_url)
        VALUES ('old-selected', 'Old selected', 'model', 'provider', 1, '1:1', 0.01, ?, 0, ?, 'key', 'url')
      `, [threeDaysAgo.toISOString(), now.toISOString()]);

      const deleted = store.cleanupOldUnselected(twoDaysAgo);

      expect(deleted).toBe(0);

      const gen = store.getGeneration('old-selected');
      expect(gen).not.toBeNull();
    });

    it('should delete associated images when cleaning up', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Insert old generation with multiple images
      db.run(`
        INSERT INTO generations (id, prompt, model, provider, count, aspect_ratio, cost, created_at)
        VALUES ('old-with-images', 'Old with images', 'model', 'provider', 3, '1:1', 0.03, ?)
      `, [threeDaysAgo.toISOString()]);

      db.run(`INSERT INTO images (generation_id, index_num, preview_url) VALUES ('old-with-images', 0, 'url0')`);
      db.run(`INSERT INTO images (generation_id, index_num, preview_url) VALUES ('old-with-images', 1, 'url1')`);
      db.run(`INSERT INTO images (generation_id, index_num, preview_url) VALUES ('old-with-images', 2, 'url2')`);

      store.cleanupOldUnselected(twoDaysAgo);

      const imgResult = db.exec('SELECT COUNT(*) FROM images WHERE generation_id = ?', ['old-with-images']);
      expect(imgResult[0].values[0][0]).toBe(0);
    });

    it('should return 0 when nothing to clean up', () => {
      // Create only recent generations
      store.createGeneration({
        prompt: 'Recent',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      });

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const deleted = store.cleanupOldUnselected(oneDayAgo);

      expect(deleted).toBe(0);
    });

    it('should handle cleanup on empty database', () => {
      const deleted = store.cleanupOldUnselected(new Date());
      expect(deleted).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle special characters in prompt', () => {
      const data = {
        prompt: "A cat's \"meow\" with <html> & unicode: \u2764\ufe0f \u{1f600}",
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved!.prompt).toBe(data.prompt);
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'A'.repeat(10000);
      const data = {
        prompt: longPrompt,
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved!.prompt).toBe(longPrompt);
      expect(retrieved!.prompt.length).toBe(10000);
    });

    it('should handle zero cost', () => {
      const data = {
        prompt: 'Free generation',
        model: 'free-model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg' }]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved!.cost).toBe(0);

      const costs = store.getCosts();
      expect(costs.total).toBe(0);
    });

    it('should handle fractional costs with precision', () => {
      store.createGeneration({
        prompt: 'Small cost 1',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.001,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/1.jpg' }]
      });

      store.createGeneration({
        prompt: 'Small cost 2',
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.002,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://a.com/2.jpg' }]
      });

      const costs = store.getCosts();
      expect(costs.total).toBeCloseTo(0.003, 4);
    });

    it('should handle generation with no images', () => {
      const data = {
        prompt: 'No images test',
        model: 'model',
        provider: 'provider',
        count: 0,
        aspect_ratio: '1:1',
        cost: 0,
        images: []
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.images).toBeUndefined(); // No images array when empty
    });

    it('should handle null values in optional fields', () => {
      const data = {
        prompt: 'Minimal',
        negative_prompt: undefined,
        context: undefined,
        model: 'model',
        provider: 'provider',
        count: 1,
        aspect_ratio: '1:1',
        cost: 0.01,
        images: [{ generation_id: '', index_num: 0, preview_url: 'https://test.com/img.jpg', width: undefined, height: undefined, seed: undefined }]
      };

      const created = store.createGeneration(data);
      const retrieved = store.getGeneration(created.id);

      expect(retrieved!.negative_prompt).toBeNull();
      expect(retrieved!.context).toBeNull();
      expect(retrieved!.images![0].width).toBeNull();
      expect(retrieved!.images![0].height).toBeNull();
      expect(retrieved!.images![0].seed).toBeNull();
    });
  });
});
