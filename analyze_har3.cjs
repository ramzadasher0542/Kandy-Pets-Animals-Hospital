const fs = require('fs');

try {
  const rawData = fs.readFileSync('localhost.har', 'utf8');
  const har = JSON.parse(rawData);
  const entries = har.log.entries;
  
  console.log('--- ALL REQUESTS IN HAR ---');
  for (const entry of entries) {
    const status = entry.response ? entry.response.status : 'NO_RESPONSE';
    const method = entry.request.method;
    const url = entry.request.url.split('?')[0];
    
    console.log(`[${status}] ${method} ${url}`);
  }
} catch (error) {
  console.error('Error analyzing HAR file:', error.message);
}
