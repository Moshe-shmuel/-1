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

  // API to list source files
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
