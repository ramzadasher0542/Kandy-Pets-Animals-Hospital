import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function runTest() {
  if (!url || !key) {
    console.error('Missing env vars');
    return;
  }

  const supabase = createClient(url, key);
  
  console.log('Connecting to Realtime...');
  
  const channel = supabase.channel('test-channel');
  
  let success = false;
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'inventory' },
    (payload) => {
      console.log('Received payload:', payload);
    }
  );

  channel.subscribe(async (status) => {
    console.log('Channel status:', status);
    if (status === 'SUBSCRIBED') {
      success = true;
      console.log('Successfully subscribed to Realtime!');
      
      // Test insertion
      console.log('Inserting test record...');
      const { data, error } = await supabase.from('inventory').insert({
        id: 'test-realtime-id',
        sku: 'TEST-100',
        name: 'Realtime Test Item',
        category: 'service',
        price: 10,
        cost: 5,
        stock: 0,
        min_stock: 0
      }).select();
      
      if (error) console.error('Insert error:', error.message);
      else console.log('Insert successful:', data);
      
      // Cleanup
      console.log('Cleaning up...');
      await supabase.from('inventory').delete().eq('id', 'test-realtime-id');
      
      setTimeout(() => process.exit(0), 3000); // wait for events to arrive
    }
  });

  setTimeout(() => {
    if (!success) {
      console.error('Failed to subscribe within 10 seconds');
      process.exit(1);
    }
  }, 10000);
}

runTest();
