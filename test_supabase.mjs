import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function testSupabase() {
  if (!url || !key) {
    console.log('MISSING ENV VARS');
    return;
  }
  
  // Test old table (should exist)
  const res1 = await fetch(`${url}/rest/v1/inventory?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log(`inventory table status: ${res1.status}`);

  // Test new table (pets)
  const res2 = await fetch(`${url}/rest/v1/pets?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log(`pets table status: ${res2.status}`);

  // Test new table (grooming_logs)
  const res3 = await fetch(`${url}/rest/v1/grooming_logs?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log(`grooming_logs table status: ${res3.status}`);
}

testSupabase().catch(console.error);
