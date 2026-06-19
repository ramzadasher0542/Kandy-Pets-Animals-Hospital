const fs = require('fs');

try {
  const rawData = fs.readFileSync('localhost.har', 'utf8');
  const har = JSON.parse(rawData);
  const entries = har.log.entries;
  
  let issueCount = 0;
  for (const entry of entries) {
    // Some failed requests don't have a response or status is 0
    if (!entry.response || entry.response.status === 0 || entry._error || entry.response.status >= 400 || (entry.response.content && entry.response.content.text && entry.response.content.text.includes('Error'))) {
        console.log(`\nURL: ${entry.request.url}`);
        console.log(`Status: ${entry.response ? entry.response.status : 'No response'}`);
        if (entry._error) console.log(`_error: ${entry._error}`);
        issueCount++;
    }
  }
  
  console.log(`\nFound ${issueCount} potential issues.`);
  
} catch (error) {
  console.error('Error analyzing HAR file:', error.message);
}
