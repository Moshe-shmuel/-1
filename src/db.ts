import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

export async function getDb() {
  if (!db) {
    db = await Database.load('sqlite:highlight.db');
    
    // Initialize tables if they don't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        "order" INTEGER
      );
      CREATE TABLE IF NOT EXISTS subcategories (
        id TEXT PRIMARY KEY,
        name TEXT,
        categoryId TEXT
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT,
        content TEXT,
        subcategoryId TEXT
      );
    `);
  }
  return db;
}

export const tauriAPI = {
  query: async ({ table, where }: { table: string, where?: Record<string, any> }): Promise<any[]> => {
    const database = await getDb();
    let query = `SELECT * FROM ${table}`;
    const values: any[] = [];
    
    if (where) {
      const keys = Object.keys(where);
      query += ` WHERE ` + keys.map(k => `${k} = ?`).join(' AND ');
      values.push(...Object.values(where));
    }
    
    return database.select(query, values);
  },
  insert: async ({ table, data }: { table: string, data: Record<string, any> }): Promise<any> => {
    const database = await getDb();
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const query = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    return database.execute(query, Object.values(data));
  }
};
