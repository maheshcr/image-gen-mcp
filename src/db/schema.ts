/**
 * SQLite schema for generation tracking
 */

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    context TEXT,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    count INTEGER NOT NULL,
    aspect_ratio TEXT NOT NULL,
    cost REAL NOT NULL,
    created_at TEXT NOT NULL,
    selected_index INTEGER,
    selected_at TEXT,
    storage_key TEXT,
    public_url TEXT
  );

  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_id TEXT NOT NULL,
    index_num INTEGER NOT NULL,
    preview_url TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    seed INTEGER,
    FOREIGN KEY (generation_id) REFERENCES generations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_generations_created ON generations(created_at);
  CREATE INDEX IF NOT EXISTS idx_generations_selected ON generations(selected_index);
  CREATE INDEX IF NOT EXISTS idx_images_generation ON images(generation_id);
`;
