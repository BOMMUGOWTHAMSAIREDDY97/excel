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

async function testConnection() {
  try {
    console.log('Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Successfully connected to the database!');
    
    const res = await client.query('SELECT current_database(), current_user');
    console.log('Database Info:', res.rows[0]);
    
    await client.end();
    console.log('Connection closed.');
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    console.error('\nTips:');
    if (err.message.includes('password authentication failed')) {
      console.error('- Check if your password in the connection string is correct.');
    } else if (err.message.includes('ENOTFOUND')) {
      console.error('- Check if the host address is correct.');
    }
    process.exit(1);
  }
}

testConnection();
