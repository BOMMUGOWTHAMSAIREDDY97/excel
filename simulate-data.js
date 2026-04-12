const { createClient } = require('@supabase/supabase-js');

// ─── Use your REAL Supabase project credentials ───
const SUPABASE_URL = 'https://jmknmbgssiztxzdttsmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── This script READS real data from Supabase (no random values) ───
async function fetchRealData() {
  console.log('📡 Fetching REAL data from Supabase...\n');

  const { data, error } = await supabase
    .from('battery_data')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    console.error('❌ Error fetching data:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No data found in battery_data table.');
    console.log('    Make sure your ESP32 is sending data to Supabase.');
    process.exit(0);
  }

  console.log(`✅ Found ${data.length} real records from Supabase:\n`);
  
  // Show latest reading
  const latest = data[0];
  console.log('═══════════════════════════════════════');
  console.log('  📊 LATEST BATTERY READING (REAL DATA)');
  console.log('═══════════════════════════════════════');
  console.log(`  🔋 Voltage:     ${latest.voltage} V`);
  console.log(`  ⚡ Current:     ${latest.current} A`);
  console.log(`  🌡️  Temperature: ${latest.temperature} °C`);
  console.log(`  🔋 SOC:         ${latest.soc} %`);
  console.log(`  💚 SOH:         ${latest.soh} %`);
  console.log(`  🔌 Relay:       ${latest.relay_status ? 'ENGAGED' : 'OPEN'}`);
  console.log(`  🕐 Timestamp:   ${latest.created_at}`);
  console.log('═══════════════════════════════════════\n');

  // Show recent history table
  console.log('📋 Recent 25 readings:');
  console.table(data.map(row => ({
    time: new Date(row.created_at).toLocaleTimeString(),
    voltage: row.voltage,
    current: row.current,
    temp: row.temperature,
    soc: row.soc,
    soh: row.soh
  })));

  // ─── Real-time listener for new data from ESP32 ───
  console.log('\n🔴 LIVE: Listening for new ESP32 data in real-time...');
  console.log('   (Waiting for your ESP32 to send new readings)\n');

  supabase
    .channel('live-battery-feed')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'battery_data' },
      (payload) => {
        const row = payload.new;
        const time = new Date(row.created_at).toLocaleTimeString();
        console.log(`📡 [${time}] NEW DATA → V=${row.voltage}V | A=${row.current}A | T=${row.temperature}°C | SOC=${row.soc}% | SOH=${row.soh}%`);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Real-time subscription active. Waiting for ESP32...\n');
      }
    });
}

fetchRealData();
