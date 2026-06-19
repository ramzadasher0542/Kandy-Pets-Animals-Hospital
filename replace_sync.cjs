const fs = require('fs');

const path = './src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace single item pushes
// e.g. setSyncQueue(prev => [...prev, syncItem]);
content = content.replace(/setSyncQueue\(\s*prev\s*=>\s*\[\.\.\.prev,\s*([a-zA-Z0-9_]+)\s*\]\s*\);/g, 'pushToOfflineQueue($1);');

// Replace two item pushes
// e.g. setSyncQueue(prev => [...prev, syncInv, syncAlert]);
content = content.replace(/setSyncQueue\(\s*prev\s*=>\s*\[\.\.\.prev,\s*([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_]+)\s*\]\s*\);/g, 'pushToOfflineQueue($1);\n      pushToOfflineQueue($2);');

fs.writeFileSync(path, content, 'utf8');
console.log('Replaced setSyncQueue calls successfully.');
