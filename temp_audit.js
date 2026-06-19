import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log("=== SUPABASE CLOUD AUDIT ===");
  
  const tables = ['inventory', 'invoices', 'patients', 'records', 'appointments', 'alerts', 'notifications'];
  const auditResults = {};

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.log(`[${table}] ERROR:`, error.message);
      continue;
    }
    
    let corrupted = 0;
    const corruptedIds = [];

    // Basic heuristic for corruption
    data.forEach(row => {
      if (!row.id) corrupted++;
      if (table === 'inventory' && (row.price < 0 || row.stock < 0)) {
        corrupted++;
        corruptedIds.push(row.id);
      }
      if (table === 'invoices' && row.total < 0) {
        corrupted++;
        corruptedIds.push(row.id);
      }
    });

    auditResults[table] = {
      totalRows: data.length,
      corruptedRows: corrupted,
      corruptedIds: corruptedIds
    };
    
    console.log(`[${table}] ${data.length} total rows. ${corrupted} corrupted.`);
  }

  console.log("\n=== AUDIT RESULTS JSON ===");
  console.log(JSON.stringify(auditResults, null, 2));
}

runAudit();
