import fs from 'fs';
import path from 'path';

const sourcesDir = path.join(process.cwd(), 'sources');
const outputDir = path.join(process.cwd(), 'public', 'data');

function getFilesRecursively(dir, baseDir = dir) {
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

function convert() {
  if (!fs.existsSync(sourcesDir)) {
    console.log('Sources directory not found.');
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = getFilesRecursively(sourcesDir);
  const sourceNames = [];

  files.forEach(fileInfo => {
    const content = fs.readFileSync(fileInfo.path, 'utf-8');
    const relativePath = fileInfo.name;
    const jsonRelativePath = relativePath.replace(/\.txt$/, '.json');
    const jsonPath = path.join(outputDir, jsonRelativePath);
    
    sourceNames.push(jsonRelativePath);

    // Ensure the directory for the JSON file exists
    const jsonDir = path.dirname(jsonPath);
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }

    // Save as JSON string
    fs.writeFileSync(jsonPath, JSON.stringify(content));
    console.log(`Converted ${fileInfo.name} -> ${jsonRelativePath}`);
  });

  // Generate sources.json
  fs.writeFileSync(path.join(outputDir, 'sources.json'), JSON.stringify(sourceNames));
  console.log(`Generated sources.json with ${sourceNames.length} entries.`);

  console.log(`Finished converting ${files.length} files.`);
}

convert();
