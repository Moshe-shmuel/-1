import fs from 'fs';
import path from 'path';

const sourcesDir = path.join(process.cwd(), 'sources');
const outputDir = path.join(process.cwd(), 'public', 'data');

function getFilesRecursively(dir, baseDir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, baseDir));
    } else if (file.endsWith('.txt')) {
      const relativePath = path.relative(baseDir, filePath);
      results.push({
        name: relativePath,
        path: filePath
      });
    }
  });
  return results;
}

function generate() {
  if (!fs.existsSync(sourcesDir)) {
    console.log('Sources directory not found.');
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tractates = fs.readdirSync(sourcesDir).filter(f => {
    return fs.statSync(path.join(sourcesDir, f)).isDirectory();
  });

  const index = [];

  tractates.forEach(tractate => {
    const tractateDir = path.join(sourcesDir, tractate);
    const files = getFilesRecursively(tractateDir, tractateDir);
    const sources = {};

    files.forEach(fileInfo => {
      const content = fs.readFileSync(fileInfo.path, 'utf-8');
      sources[fileInfo.name] = content;
    });

    const outputFilePath = path.join(outputDir, `${tractate}.json`);
    fs.writeFileSync(outputFilePath, JSON.stringify(sources, null, 2));
    index.push(tractate);
    console.log(`Generated data for ${tractate} (${files.length} files) -> ${outputFilePath}`);
  });

  fs.writeFileSync(path.join(outputDir, 'index.json'), JSON.stringify(index, null, 2));
  
  // Generate tractates.js for offline use (script tag loading)
  const jsContent = `window.AVAILABLE_TRACTATES = ${JSON.stringify(index)};\n`;
  fs.writeFileSync(path.join(outputDir, 'tractates.js'), jsContent);
  
  // Also keep an empty embeddedSources.ts for compatibility during build
  const tsFile = path.join(process.cwd(), 'src', 'embeddedSources.ts');
  if (!fs.existsSync(path.dirname(tsFile))) fs.mkdirSync(path.dirname(tsFile), { recursive: true });
  fs.writeFileSync(tsFile, 'export const EMBEDDED_SOURCES: Record<string, string> = {};\n');
}

generate();
