const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.SUPABASE_URI;

if (!connectionString) {
  console.error('Error: SUPABASE_URI not found in .env file');
  process.exit(1);
}

const client = new Client({
  connectionString: connectionString,
});

async function checkData() {
  try {
    await client.connect();
    console.log('✅ Connected to the database!');
    
    // Check if table exists
    const tableCheck = await client.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'battery_data'
        );
    `);
    
    if (tableCheck.rows[0].exists) {
        console.log('✅ Table "battery_data" exists.');
        
        // Count rows
        const countRes = await client.query('SELECT COUNT(*) FROM public.battery_data');
        console.log(`Total rows in battery_data: ${countRes.rows[0].count}`);
        
        if (parseInt(countRes.rows[0].count) > 0) {
            // Get last 5 rows
            const latestRes = await client.query('SELECT * FROM public.battery_data ORDER BY created_at DESC LIMIT 5');
            console.log('Latest 5 rows:');
            console.table(latestRes.rows);
        } else {
            console.log('⚠️ The table is EMPTY.');
        }
    } else {
        console.log('❌ Table "battery_data" does NOT exist! You need to run setup.sql.');
    }
    
    await client.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkData();
