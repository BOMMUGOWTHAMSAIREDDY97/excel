const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jmknmbgssiztxzdttsmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function generatePredictiveTestData() {
    console.log("🚀 Starting Dataset Generation...");
    
    const points = 100;
    const dataToPush = [];
    const now = new Date();

    for (let i = 0; i < points; i++) {
        const timestamp = new Date(now.getTime() - (points - i) * 60000).toISOString();
        const phase = i < 50 ? 'discharge' : 'charge';
        
        let voltage, current, temp, soc;
        
        if (phase === 'discharge') {
            voltage = 4.1 - (i * 0.01) + (Math.random() * 0.05);
            current = -1.5 - (Math.random() * 0.5);
            temp = 28 + (i * 0.15);
            soc = 100 - i;
        } else {
            voltage = 3.6 + ((i-50) * 0.01) + (Math.random() * 0.05);
            current = 2.0 + (Math.random() * 0.3);
            temp = 35.5 - ((i-50) * 0.1);
            soc = 50 + (i-50);
        }

        dataToPush.push({
            voltage: parseFloat(voltage.toFixed(2)),
            current: parseFloat(current.toFixed(2)),
            temperature: parseFloat(temp.toFixed(1)),
            soc: Math.round(soc),
            soh: (98 - (i * 0.02)).toFixed(1), // Show a slight health degradation
            created_at: timestamp
        });
    }

    console.log(`📦 Prepared ${dataToPush.length} points (Col: V, I, T, SOC, SOH). Pushing...`);

    const { error } = await supabase.from('battery_data').insert(dataToPush);

    if (error) {
        console.error("❌ Error pushing data:", error.message);
    } else {
        console.log("✅ Dataset successfully updated in Supabase!");
        console.log("👉 Refresh your dashboard now to see the new graphs with full UPS and DOWNS.");
    }
}

generatePredictiveTestData();
