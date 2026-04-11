const supabase = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jmknmbgssiztxzdttsmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc';

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFetch() {
    const { data, error } = await client
        .from('battery_data')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching data:', error);
    } else {
        console.log('Data fetched successfully:', data);
    }
}

testFetch();
