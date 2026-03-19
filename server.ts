import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), "public")));

  // API to list folders in sources
  app.get("/api/sources/folders", (req, res) => {
    const sourcesDir = path.join(process.cwd(), "src-tauri", "sources");
    if (!fs.existsSync(sourcesDir)) {
      return res.json([]);
    }
    const folders = fs.readdirSync(sourcesDir).filter(f => fs.statSync(path.join(sourcesDir, f)).isDirectory());
    res.json(folders);
  });

  // API to list subfolders in a folder
  app.get("/api/sources/folders/:folder", (req, res) => {
    const { folder } = req.params;
    const folderPath = path.join(process.cwd(), "src-tauri", "sources", folder);
    if (!fs.existsSync(folderPath)) {
      return res.json([]);
    }
    const subfolders = fs.readdirSync(folderPath).filter(f => fs.statSync(path.join(folderPath, f)).isDirectory());
    res.json(subfolders);
  });

  // API to list files in a subfolder
  app.get("/api/sources/files/:folder/:subfolder", (req, res) => {
    const { folder, subfolder } = req.params;
    const subfolderPath = path.join(process.cwd(), "src-tauri", "sources", folder, subfolder);
    if (!fs.existsSync(subfolderPath)) {
      return res.json([]);
    }
    const files = fs.readdirSync(subfolderPath).filter(f => f.endsWith(".txt"));
    res.json(files);
  });

  // API to get file content from a subfolder
  app.get("/api/sources/content/:folder/:subfolder/:filename", (req, res) => {
    const { folder, subfolder, filename } = req.params;
    const filePath = path.join(process.cwd(), "src-tauri", "sources", folder, subfolder, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.send(content);
  });

  // API to list source files (legacy)
  app.get("/api/sources", (req, res) => {
    const sourcesDir = path.join(process.cwd(), "sources");
    if (!fs.existsSync(sourcesDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(sourcesDir).filter(f => f.endsWith(".txt"));
    res.json(files);
  });

  // API to get source file content
  app.get("/api/sources/:filename", (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(process.cwd(), "sources", filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.send(content);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
