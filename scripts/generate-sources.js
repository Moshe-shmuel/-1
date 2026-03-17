import fs from 'fs';
import path from 'path';

const sourcesDir = path.join(process.cwd(), 'sources');
const outputFile = path.join(process.cwd(), 'src', 'embeddedSources.ts');

function getFilesRecursively(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, baseDir));
    } else if (file.endsWith('.txt')) {
      // Store the relative path as the key
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
    console.log('Sources directory not found, creating empty embedded sources.');
    fs.writeFileSync(outputFile, 'export const EMBEDDED_SOURCES: Record<string, string> = {};\n');
    return;
  }

  const files = getFilesRecursively(sourcesDir);
  const sources = {};

  files.forEach(fileInfo => {
    const content = fs.readFileSync(fileInfo.path, 'utf-8');
    sources[fileInfo.name] = content;
  });

  const content = `export const EMBEDDED_SOURCES: Record<string, string> = ${JSON.stringify(sources, null, 2)};\n`;
  
  // Ensure src directory exists
  const srcDir = path.dirname(outputFile);
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, content);
  console.log(`Generated ${outputFile} with ${files.length} sources.`);
}

generate();
