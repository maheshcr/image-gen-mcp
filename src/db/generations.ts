import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { SCHEMA } from './schema.js';
import { randomUUID } from 'crypto';

export interface Generation {
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

export interface GenerationImage {
  generation_id: string;
  index_num: number;
  preview_url: string;
  width?: number;
  height?: number;
  seed?: number;
}

export interface CostSummary {
  total: number;
  by_provider: Record<string, number>;
  by_model: Record<string, number>;
  generation_count: number;
}

export class GenerationStore {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private initPromise: Promise<void>;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs();

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load existing database or create new
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Run schema
    this.db.run(SCHEMA);
    this.save();
  }

  private async ensureInit(): Promise<SqlJsDatabase> {
    await this.initPromise;
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  private save(): void {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      writeFileSync(this.dbPath, buffer);
    }
  }

  async createGeneration(data: Omit<Generation, 'id' | 'created_at'> & { images: GenerationImage[] }): Promise<Generation> {
    const db = await this.ensureInit();
    const id = randomUUID();
    const created_at = new Date().toISOString();

    db.run(`
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
      db.run(`
        INSERT INTO images (generation_id, index_num, preview_url, width, height, seed)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, img.index_num, img.preview_url, img.width ?? null, img.height ?? null, img.seed ?? null]);
    }

    this.save();

    return {
      id,
      ...data,
      created_at,
    };
  }

  async getGeneration(id: string): Promise<Generation | null> {
    const db = await this.ensureInit();

    const genResult = db.exec('SELECT * FROM generations WHERE id = ?', [id]);
    if (genResult.length === 0 || genResult[0].values.length === 0) return null;

    const gen = this.rowToGeneration(genResult[0].columns, genResult[0].values[0]);

    const imgResult = db.exec('SELECT * FROM images WHERE generation_id = ? ORDER BY index_num', [id]);
    if (imgResult.length > 0) {
      gen.images = imgResult[0].values.map(row => this.rowToImage(imgResult[0].columns, row));
    }

    return gen;
  }

  async markSelected(id: string, index: number, storageKey: string, publicUrl: string): Promise<void> {
    const db = await this.ensureInit();
    db.run(`
      UPDATE generations
      SET selected_index = ?, selected_at = ?, storage_key = ?, public_url = ?
      WHERE id = ?
    `, [index, new Date().toISOString(), storageKey, publicUrl, id]);
    this.save();
  }

  async listGenerations(limit: number = 10): Promise<Generation[]> {
    const db = await this.ensureInit();

    const genResult = db.exec(`
      SELECT * FROM generations
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    if (genResult.length === 0) return [];

    return genResult[0].values.map(row => {
      const gen = this.rowToGeneration(genResult[0].columns, row);
      const imgResult = db.exec('SELECT * FROM images WHERE generation_id = ? ORDER BY index_num', [gen.id]);
      if (imgResult.length > 0) {
        gen.images = imgResult[0].values.map(imgRow => this.rowToImage(imgResult[0].columns, imgRow));
      }
      return gen;
    });
  }

  async getCosts(since?: Date): Promise<CostSummary> {
    const db = await this.ensureInit();

    const whereClause = since ? 'WHERE created_at >= ?' : '';
    const params = since ? [since.toISOString()] : [];

    const totalResult = db.exec(`
      SELECT COALESCE(SUM(cost), 0) as total, COUNT(*) as count
      FROM generations ${whereClause}
    `, params);

    const total = totalResult.length > 0 ? {
      total: totalResult[0].values[0][0] as number,
      count: totalResult[0].values[0][1] as number
    } : { total: 0, count: 0 };

    const providerResult = db.exec(`
      SELECT provider, SUM(cost) as total
      FROM generations ${whereClause}
      GROUP BY provider
    `, params);

    const modelResult = db.exec(`
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

  private rowToGeneration(columns: string[], values: any[]): Generation {
    const obj: any = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj as Generation;
  }

  private rowToImage(columns: string[], values: any[]): GenerationImage {
    const obj: any = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj as GenerationImage;
  }

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}
