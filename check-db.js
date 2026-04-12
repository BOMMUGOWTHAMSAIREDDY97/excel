const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://jmknmbgssiztxzdttsmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkColumns() {
    const { data, error } = await supabase.from('battery_data').select('*').limit(1);
    if (error) {
        console.log("Error:", error);
    } else if (data && data.length > 0) {
        console.log("Real Columns in DB:", Object.keys(data[0]));
    } else {
        console.log("Table is empty, cannot check columns by select.");
    }
}
checkColumns();
