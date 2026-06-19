const fs = require('fs');

try {
  const rawData = fs.readFileSync('localhost.har', 'utf8');
  const har = JSON.parse(rawData);
  const entries = har.log.entries;
  
  console.log('--- ALL REQUESTS IN HAR ---');
  for (const entry of entries) {
    const status = entry.response ? entry.response.status : 'NO_RESPONSE';
    const method = entry.request.method;
    const url = entry.request.url.split('?')[0]; // simplify url
    const _error = entry._error || '';
    
    // Check if it's a supabase request
    const isSupabase = url.includes('supabase.co');
    
    if (status !== 200 && status !== 304 && status !== 101) {
       console.log(`[!] ${method} ${status} ${url} ${_error}`);
    } else if (isSupabase) {
       console.log(`[Supabase] ${method} ${status} ${url} ${_error}`);
    }
  }
} catch (error) {
  console.error('Error analyzing HAR file:', error.message);
}
