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

async function simulateData() {
  try {
    await client.connect();
    console.log('✅ Connected to database. Simulating real-time data...');

    let soc = 100;

    // Simulate real-time updates every 1.5 seconds
    setInterval(async () => {
      // Generate some realistic-looking random sensor data
      const voltage = (Math.random() * (4.2 - 3.5) + 3.5).toFixed(2);
      const current = (Math.random() * (5.5 - 0.5) + 0.5).toFixed(2);
      const temperature = (Math.random() * (45.0 - 25.0) + 25.0).toFixed(2);
      
      // Gradually deplete battery
      soc -= 0.1;
      if (soc < 5) soc = 100; // Reset when empty
      
      const soh = 94.0;
      const relay_status = true;

      const query = `
        INSERT INTO public.battery_data (voltage, current, temperature, soc, soh)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      
      const values = [voltage, current, temperature, soc.toFixed(2), soh];

      try {
        await client.query(query, values);
        console.log(`📡 Broadcasted data to Supabase: V=${voltage}, A=${current}, T=${temperature}°C, SOC=${soc.toFixed(1)}%`);
      } catch (insertErr) {
        console.error('❌ Error inserting data:', insertErr.message);
        if (insertErr.message.includes('relation "public.battery_data" does not exist')) {
            console.error('Please make sure you have run the setup.sql file in your Supabase SQL Editor.');
            process.exit(1);
        }
      }
    }, 1500);

  } catch (err) {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  }
}

// Start simulation
simulateData();
