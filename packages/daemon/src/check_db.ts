import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  console.log('Querying daemon_status...');
  const { data: status, error: statusErr } = await supabase
    .from('daemon_status')
    .select('*')
    .eq('id', 'main')
    .single();

  if (statusErr) {
    console.error('Error fetching daemon_status:', statusErr.message);
  } else {
    console.log('daemon_status contents:', JSON.stringify(status, null, 2));
  }

  console.log('Querying last 5 transfers...');
  const { data: transfers, error: transfersErr } = await supabase
    .from('transfers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (transfersErr) {
    console.error('Error fetching transfers:', transfersErr.message);
  } else {
    console.log('transfers contents:', JSON.stringify(transfers, null, 2));
  }
}

check().catch(console.error);
