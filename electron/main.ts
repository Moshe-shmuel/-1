import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
//
process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

// Initialize SQLite Database
const dbPath = path.join(app.getPath('userData'), 'app_database.db');
const db = new Database(dbPath);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS subcategories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    categoryId TEXT NOT NULL,
    FOREIGN KEY (categoryId) REFERENCES categories(id)
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    subcategoryId TEXT NOT NULL,
    isMain INTEGER DEFAULT 0,
    FOREIGN KEY (subcategoryId) REFERENCES subcategories(id)
  );
`);

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    width: 1200,
    height: 800,
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// IPC Handlers for Database
ipcMain.handle('db-query', async (event, { table, where }) => {
  let sql = `SELECT * FROM ${table}`;
  const params = [];
  if (where) {
    const keys = Object.keys(where);
    sql += ` WHERE ${keys.map(k => `${k} = ?`).join(' AND ')}`;
    params.push(...Object.values(where));
  }
  return db.prepare(sql).all(...params);
});

ipcMain.handle('db-insert', async (event, { table, data }) => {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  return db.prepare(sql).run(...Object.values(data));
});

ipcMain.handle('db-delete', async (event, { table, id }) => {
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);
