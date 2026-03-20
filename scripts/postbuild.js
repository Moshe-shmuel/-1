import fs from 'fs';
import path from 'path';

const distDir = path.join(process.cwd(), 'dist');
const targetDirName = 'מדגיש ומקשר אוטומטי';
const targetPath = path.join(distDir, targetDirName);

function postbuild() {
  if (!fs.existsSync(distDir)) {
    console.error('Dist directory not found.');
    return;
  }

  // Create target directory
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  // List all files in dist (except the target directory itself)
  const items = fs.readdirSync(distDir);
  
  items.forEach(item => {
    if (item === targetDirName) return;
    
    const oldPath = path.join(distDir, item);
    const newPath = path.join(targetPath, item);
    
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`Moved ${item} to ${targetDirName}/`);
    } catch (err) {
      console.error(`Error moving ${item}:`, err);
    }
  });

  console.log(`Postbuild complete: All files moved to ${targetDirName}/`);
}

postbuild();
