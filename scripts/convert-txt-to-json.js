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

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const files = getFilesRecursively(sourcesDir);
  const categories = {}; // { categoryName: [sourceNameWithTxt, ...] }

  files.forEach(fileInfo => {
    const content = fs.readFileSync(fileInfo.path, 'utf-8');
    const relativePath = fileInfo.name; // e.g. "תנך/בראשית.txt" or "בראשית.txt"
    
    const pathParts = relativePath.split(path.sep);
    let category = "כללי";
    let fileName = relativePath;
    
    if (pathParts.length > 1) {
      category = pathParts[0];
    }

    const cleanName = relativePath.replace(/\.txt$/, '');
    const jsPath = path.join(outputDir, cleanName + '.js');
    
    if (!categories[category]) {
      categories[category] = [];
    }
    // Add with .txt extension as requested
    categories[category].push(cleanName + ".txt");

    // Ensure the directory for the JS file exists
    const jsDir = path.dirname(jsPath);
    if (!fs.existsSync(jsDir)) {
      fs.mkdirSync(jsDir, { recursive: true });
    }

    // Save as JS file that assigns to a global object
    const jsContent = `window.appData = window.appData || {};\nwindow.appData["${cleanName}"] = ${JSON.stringify(content)};`;
    fs.writeFileSync(jsPath, jsContent);
    console.log(`Converted ${fileInfo.name} -> ${cleanName}.js`);
  });

  // Generate sources.js with category structure
  const sourcesJsContent = `window.appCategories = ${JSON.stringify(categories)};`;
  fs.writeFileSync(path.join(outputDir, 'sources.js'), sourcesJsContent);
  console.log(`Generated sources.js with ${Object.keys(categories).length} categories.`);

  console.log(`Finished converting ${files.length} files.`);
}

convert();
