const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
    const txt = fs.readFileSync(filePath, 'utf8');
    const htmlFors = [...txt.matchAll(/htmlFor=["']([^"']+)["']/g)].map(m => m[1]);
    const ids = [...txt.matchAll(/id=["']([^"']+)["']/g)].map(m => m[1]);
    const missing = htmlFors.filter(h => !ids.includes(h));
    if (missing.length > 0) {
        console.log(`Mismatches in ${filePath}:`, missing);
    }
}

function processDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            processDirectory(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.tsx')) {
            checkFile(fullPath);
        }
    }
}

checkFile('src/App.tsx');
processDirectory('src/components');
