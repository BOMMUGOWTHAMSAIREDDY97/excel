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
    let voltage = 4.15;
    let current = 2.5;
    let temperature = 32.0;
    let timeStep = 0;

    // Simulate real-time updates every 1.5 seconds
    setInterval(async () => {
      timeStep += 0.1;
      
      // Generate smooth curves using Math.sin
      voltage = 3.8 + Math.sin(timeStep) * 0.3 + (Math.random() * 0.02);
      current = 2.5 + Math.sin(timeStep * 1.5) * 1.5 + (Math.random() * 0.5);
      temperature = 35.0 + Math.sin(timeStep * 0.5) * 5.0 + (Math.random() * 0.5);
      
      // Gradually deplete battery
      soc -= 0.1;
      if (soc < 5) soc = 100; // Reset when empty
      
      const soh = 94.0;

      const query = `
        INSERT INTO public.battery_data (voltage, current, temperature, soc, soh)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      
      const values = [voltage.toFixed(2), current.toFixed(2), temperature.toFixed(2), soc.toFixed(2), soh];

      try {
        await client.query(query, values);
        console.log(`📡 Broadcasted data to Supabase: V=${voltage.toFixed(2)}, A=${current.toFixed(2)}, T=${temperature.toFixed(2)}°C, SOC=${soc.toFixed(1)}%`);
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
