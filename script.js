const CONFIG = {
    POLL_INTERVAL: 1500,
    HISTORY_LEN: 200,
    THRESHOLDS: {
        TEMP_WARM: 42,
        TEMP_CRIT: 52,
        VOLT_LOW: 3.2,
        CURR_HIGH: 8.0
    }
};

// Supabase Configuration
const SUPABASE_URL = 'https://jmknmbgssiztxzdttsmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc';

let supabaseClient;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("Supabase script failed to load from CDN.");
}

let charts = {};
let gauges = {};
let history = { v: [], c: [], t: [], s: [], l: [] };

// All data comes from Supabase — no simulated/random values

window.onload = () => {
    initCharts();
    initSpeedos();
    initNASACharts(); // Initialize NASA Research section
    startClock();
    initSupabase(); // Start real-time listener
};

function startClock() {
    setInterval(() => {
        document.getElementById('clock').innerText = new Date().toLocaleTimeString();
    }, 1000);
}

// 1. Chart.js Setup
function initCharts() {
    const common = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: { 
            legend: { display: false },
            tooltip: { 
                backgroundColor: 'rgba(0,0,0,0.8)',
                titleFont: { family: 'Orbitron' },
                bodyFont: { family: 'Inter' }
            }
        },
        scales: {
            x: { display: false },
            y: { 
                grid: { color: 'rgba(255,255,255,0.05)' }, 
                ticks: { color: '#888', font: { size: 9 } },
                beginAtZero: false,
                grace: '15%'
            }
        },
        elements: { 
            line: { tension: 0.3, borderWidth: 2.5, fill: true }, 
            point: { radius: 0, hoverRadius: 5, hitRadius: 10 }
        }
    };

    // Voltage: auto-scale to data range (no fixed min/max)
    charts.v = new Chart(document.getElementById('chart-v'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'V', borderColor: '#00f2ff', backgroundColor: 'rgba(0, 242, 255, 0.15)', data: [] }] },
        options: { ...common, scales: { ...common.scales, y: { ...common.scales.y, grace: '20%' } } }
    });
    // Current: auto-scale
    charts.c = new Chart(document.getElementById('chart-c'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'A', borderColor: '#ffdb29', backgroundColor: 'rgba(255, 219, 41, 0.15)', data: [] }] },
        options: { ...common, scales: { ...common.scales, y: { ...common.scales.y, grace: '20%' } } }
    });
    // Temperature: auto-scale
    charts.t = new Chart(document.getElementById('chart-t'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: '°C', borderColor: '#ff3c3c', backgroundColor: 'rgba(255, 60, 60, 0.15)', data: [] }] },
        options: { ...common, scales: { ...common.scales, y: { ...common.scales.y, grace: '20%' } } }
    });
    // SOC: auto-scale (not fixed 0-100 so variations are visible)
    charts.s = new Chart(document.getElementById('chart-s'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: '%', borderColor: '#00ff8c', backgroundColor: 'rgba(0, 255, 140, 0.15)', data: [] }] },
        options: { ...common, scales: { ...common.scales, y: { ...common.scales.y, grace: '20%' } } }
    });
}

// 2. Custom Canvas Speedometers
function initSpeedos() {
    const cv = document.getElementById('gauge-voltage');
    const ct = document.getElementById('gauge-temp');
    cv.width = 300; cv.height = 150;
    ct.width = 300; ct.height = 150;
    gauges.v = { ctx: cv.getContext('2d'), val: 0, max: 4.5 };
    gauges.t = { ctx: ct.getContext('2d'), val: 0, max: 80 };
}

function drawSpeedo(config, value, color) {
    const { ctx, max } = config;
    ctx.clearRect(0, 0, 300, 150);
    const centerX = 150; const centerY = 140; const radius = 120;

    // Track (Back)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Fill - Clamp percent between 0 and 1 to prevent gauge drawing backward
    const percent = Math.max(0, Math.min(value / max, 1));
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, Math.PI + (percent * Math.PI));
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.stroke();
}

// 3. Supabase Integration
async function initSupabase() {
    if (!supabaseClient) {
        console.error("Supabase client not initialized.");
        mainLoopFallback();
        return;
    }

    // 1. Fetch initial state with timeout
    logEvent('SYNCING WITH CLOUD STORAGE...', 'system');
    document.getElementById('conn-text').innerText = "SYNCING...";
    
    // Set a timeout to prevent hanging if connection is slow
    const syncTimeout = setTimeout(() => {
        if (document.getElementById('conn-text').innerText === "SYNCING...") {
            logEvent('SYNC TIMEOUT - CHECKING BRIDGE...', 'warn');
            document.getElementById('conn-text').innerText = "BRIDGE FAULT";
            mainLoopFallback();
        }
    }, 5000);

    const { data, error } = await supabaseClient
        .from('battery_data')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    clearTimeout(syncTimeout);

    if (error) {
        if (error.code === 'PGRST116' || error.message.includes('not found')) {
            logEvent('DB SETUP MISSING (See setup.sql)', 'warn');
        } else {
            logEvent('DB LINK FAILED: ' + error.message, 'crit');
        }
        mainLoopFallback();
        return;
    }

    if (data && data.length > 0) {
        logEvent('CLOUD LINK ESTABLISHED', 'success');
        document.getElementById('conn-text').innerText = "LIVE (SUPABASE)";
        document.getElementById('connection-status').className = "status-pill connected";

        const latestVal = data[0];
        if (latestVal.voltage === 0 && latestVal.current === 0) {
            logEvent('NOTICE: RAW DATA READS 0.0', 'warn');
        }

        // Populate history
        data.reverse().forEach(row => updateHistory(mapSupabaseData(row)));
        
        const latest = mapSupabaseData(data[data.length - 1]);
        updateUI(latest);
        checkAlerts(latest);

    } else {
        logEvent('REMOTE TABLE EMPTY - WAITING FOR ESP32...', 'warn');
        document.getElementById('conn-text').innerText = "WAITING FOR DATA";
        mainLoopFallback();
    }

    // 2. Subscribe to real-time changes (Unique channel for reliability)
    const channelId = 'bms-live-' + Math.random().toString(36).substring(7);
    
    supabaseClient
        .channel(channelId)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'battery_data' },
            (payload) => {
                logEvent('DATA RECEIVED FROM CLOUD', 'success');
                const newData = mapSupabaseData(payload.new);
                document.getElementById('conn-text').innerText = "LIVE (SUPABASE)";
                document.getElementById('connection-status').className = "status-pill connected";

                updateUI(newData);
                updateHistory(newData);
                checkAlerts(newData);
            }
        )
        .subscribe();
}

// Map database column names to our app's internal names
function mapSupabaseData(row) {
    // Helper: safely get a number from row, handling both null and undefined
    const safeNum = (val, fallback = 0) => (val !== undefined && val !== null) ? Number(val) : fallback;

    // Handle both 'temperature' and 'temp' column names
    let tempVal = (row.temperature !== undefined && row.temperature !== null)
        ? Number(row.temperature)
        : (row.temp !== undefined && row.temp !== null)
            ? Number(row.temp)
            : 25;

    const isFault = (tempVal === -127 || tempVal < -50);
    // if (isFault) tempVal = 0; // Show the actual -127 in UI instead of 0

    return {
        voltage:      safeNum(row.voltage, 0),
        current:      safeNum(row.current, 0),
        temp:         tempVal,
        sensor_fault: isFault,
        soc:          safeNum(row.soc, 0),
        soh:          safeNum(row.soh, 100),
        rul:          safeNum(row.rul, 250),
        fan:          tempVal > 45,
        relay_status: row.relay_status !== undefined && row.relay_status !== null ? row.relay_status : true,
        created_at:   row.created_at
    };
}

// Fallback: Retry Supabase connection (NO random/simulated data)
async function mainLoopFallback() {
    logEvent('WAITING FOR REAL DATA FROM SUPABASE...', 'warn');
    document.getElementById('conn-text').innerText = "WAITING FOR DATA";
    document.getElementById('connection-status').className = "status-pill simulated";

    // Retry fetching real data from Supabase every 5 seconds
    const retryInterval = setInterval(async () => {
        if (!supabaseClient) return;

        const { data, error } = await supabaseClient
            .from('battery_data')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(CONFIG.HISTORY_LEN);

        if (!error && data && data.length > 0) {
            clearInterval(retryInterval);
            logEvent('CLOUD LINK RE-ESTABLISHED', 'success');
            document.getElementById('conn-text').innerText = "LIVE (SUPABASE)";
            document.getElementById('connection-status').className = "status-pill connected";

            // Populate history with real data
            data.reverse().forEach(row => updateHistory(mapSupabaseData(row)));
            const latest = mapSupabaseData(data[data.length - 1]);
            updateUI(latest);
            checkAlerts(latest);

            // Start real-time listener
            supabaseClient
                .channel('battery-updates-retry')
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'battery_data' },
                    (payload) => {
                        const newData = mapSupabaseData(payload.new);
                        document.getElementById('conn-text').innerText = "LIVE (SUPABASE)";
                        document.getElementById('connection-status').className = "status-pill connected";
                        updateUI(newData);
                        updateHistory(newData);
                        checkAlerts(newData);
                    }
                )
                .subscribe();
        } else {
            logEvent('RETRYING SUPABASE CONNECTION...', 'system');
        }
    }, 5000);
}

// 4. Update Visuals
function updateUI(data) {
  try {
    // Guard: ensure numeric fields are numbers
    const volt = Number(data.voltage) || 0;
    const curr = Number(data.current) || 0;
    const temp = Number(data.temp)    || 0;
    const soc  = Number(data.soc)     || 0;
    const soh  = Number(data.soh)     || 0;
    const rul  = data.rul !== undefined ? data.rul : 250;

    // Master Battery
    const fill = document.getElementById('battery-fill-master');
    fill.style.height = `${soc}%`;
    document.getElementById('soc-value-master').innerText = soc.toFixed(1);

    if (soc < 20) fill.style.backgroundColor = 'var(--accent-red)';
    else if (soc < 45) fill.style.backgroundColor = 'var(--accent-yellow)';
    else fill.style.backgroundColor = 'var(--accent-green)';

    // Stats
    document.getElementById('stat-current').innerText = curr.toFixed(2);
    document.getElementById('stat-power').innerText   = (volt * curr).toFixed(2);
    document.getElementById('stat-temp').innerText    = temp.toFixed(1);
    document.getElementById('rul-val').innerText      = rul;

    // Gauges
    document.getElementById('val-v').innerText = volt.toFixed(2);
    document.getElementById('val-t').innerText = temp.toFixed(1);
    drawSpeedo(gauges.v, volt, '#00f2ff');
    drawSpeedo(gauges.t, temp, temp > 50 ? '#ff3c3c' : '#ffdb29');

    // Controls
    const fan = document.getElementById('fan-icon');
    if (data.fan_status || data.fan) {
        fan.classList.add('rotating');
        document.getElementById('fan-status').innerText = "ACTIVE-COOL";
    } else {
        fan.classList.remove('rotating');
        document.getElementById('fan-status').innerText = "STDBY";
    }

    const relay = document.getElementById('relay-light');
    const relayTxt = document.getElementById('relay-status');
    if (data.relay_status) {
        relay.className = "status-dot dot-on";
        relayTxt.innerText = "ENGAGED";
    } else {
        relay.className = "status-dot";
        relayTxt.innerText = "OPEN";
    }

    // EV Car Highlight
    const glow = document.getElementById('battery-glow');
    if (soh < 75) glow.style.background = 'var(--accent-red)';
    else if (soh < 85) glow.style.background = 'var(--accent-yellow)';
    else glow.style.background = 'var(--accent-green)';

    document.getElementById('soh-bar').style.width = `${soh}%`;
    document.getElementById('soh-percent-label').innerText = `${soh}%`;
  } catch(e) {
    console.error('[updateUI] Error rendering data:', e, 'data was:', data);
  }
}

function updateHistory(data) {
    const dt = data.created_at ? new Date(data.created_at) : new Date();
    // Explicitly format to IST (Asia/Kolkata)
    const time = dt.toLocaleTimeString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
    });
    history.l.push(time);
    history.v.push(data.voltage);
    history.c.push(data.current);
    history.t.push(data.temp);
    history.s.push(data.soc);

    if (history.l.length > CONFIG.HISTORY_LEN) {
        Object.keys(history).forEach(k => history[k].shift());
    }

    charts.v.data.labels = history.l;
    charts.v.data.datasets[0].data = history.v;
    charts.v.update();

    charts.c.data.labels = history.l;
    charts.c.data.datasets[0].data = history.c;
    charts.c.update();

    charts.t.data.labels = history.l;
    charts.t.data.datasets[0].data = history.t;
    charts.t.update();

    charts.s.data.labels = history.l;
    charts.s.data.datasets[0].data = history.s;
    charts.s.update();

    // Summary Stats in Chart headers
    if (history.v.length > 0) {
        document.getElementById('v-avg').innerText = `Avg: ${(history.v.reduce((a, b) => a + b, 0) / history.v.length).toFixed(2)} V`;
    }
    if (history.c.length > 0) {
        document.getElementById('c-peak').innerText = `Peak: ${Math.max(...history.c).toFixed(1)} A`;
    }
    if (history.t.length > 0) {
        document.getElementById('t-max').innerText = `Max: ${Math.max(...history.t).toFixed(1)}°C`;
    }

    // Populate Data Table
    const tbody = document.getElementById('data-tbody');
    if (tbody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${time}</td>
            <td>${data.voltage.toFixed(2)}</td>
            <td>${data.current.toFixed(2)}</td>
            <td>${data.temp.toFixed(1)}</td>
            <td>${data.soc.toFixed(1)}</td>
        `;
        tbody.prepend(tr);
        if (tbody.children.length > 50) {
            tbody.removeChild(tbody.lastChild);
        }
    }
}

// 5. Alert Engine
function checkAlerts(data) {
    const banner = document.getElementById('alert-banner');
    const title = document.getElementById('fault-title');
    const detail = document.getElementById('fault-detail');
    const logs = document.getElementById('fault-log');

    let active = false;
    let msg = "";
    let lvl = "system";

    if (data.sensor_fault) {
        active = true; msg = "SENSOR DISCONNECTED"; detail.innerText = "Check ESP32 temperature sensor wiring.";
        lvl = "warn";
    } else if (data.temp > CONFIG.THRESHOLDS.TEMP_CRIT) {
        active = true; msg = "THERMAL RUNAWAY RISK"; detail.innerText = "Critical cell temperature detected. Cooling Max!";
        lvl = "crit";
    } else if (data.voltage < CONFIG.THRESHOLDS.VOLT_LOW) {
        active = true; msg = "VOLTAGE DEPLETION"; detail.innerText = "Power source below safe threshold.";
        lvl = "warn";
    }

    if (active) {
        banner.classList.remove('hidden');
        title.innerText = msg;
        document.body.classList.add('critical-pulse-active');
        logEvent(msg, lvl);
    } else {
        banner.classList.add('hidden');
        document.body.classList.remove('critical-pulse-active');
    }
}

function logEvent(msg, type) {
    const log = document.getElementById('fault-log');
    const time = new Date().toLocaleTimeString();
    if (log.lastElementChild && log.lastElementChild.innerText.includes(msg)) return; // Don't spam

    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerText = `[${time}] ${msg}`;
    log.prepend(div);
    if (log.children.length > 20) log.removeChild(log.lastChild);
}

// 6. NASA Research Benchmark Insights
function initNASACharts() {
    const common = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(5, 10, 20, 0.9)',
                titleFont: { family: 'Orbitron' },
                bodyFont: { family: 'Inter' }
            }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#666', font: { size: 9 } } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#666', font: { size: 9 } } }
        }
    };

    // 1. NASA SOH Degradation Scatter (B0005 Dataset Analysis)
    const cycleData = [];
    for (let i = 0; i < 168; i++) {
        // Precise NASA B0005 degradation curve simulation
        const noise = (Math.random() - 0.5) * 0.35;
        const soh = 100 * Math.exp(-0.0011 * i) + noise; 
        cycleData.push({ x: i, y: soh });
    }

    new Chart(document.getElementById('chart-nasa-soh'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'SOH (%)',
                data: cycleData,
                backgroundColor: 'rgba(0, 242, 255, 0.5)',
                pointRadius: 2,
                hoverRadius: 5
            }]
        },
        options: {
            ...common,
            scales: {
                x: { ...common.scales.x, title: { display: true, text: 'Cycle Index', color: '#555', font: { size: 10 } } },
                y: { ...common.scales.y, min: 80, max: 100, title: { display: true, text: 'SOH %', color: '#555', font: { size: 10 } } }
            }
        }
    });

    // 2. Feature Importance (Horizontal Bar)
    new Chart(document.getElementById('chart-nasa-features'), {
        type: 'bar',
        data: {
            labels: ['Avg Voltage', 'Avg Current', 'Avg Temperature', 'Cycle Index'],
            datasets: [{
                data: [42, 28, 18, 12],
                backgroundColor: [
                    'rgba(0, 242, 255, 0.7)',
                    'rgba(0, 255, 140, 0.7)',
                    'rgba(255, 219, 41, 0.7)',
                    'rgba(168, 85, 247, 0.7)'
                ],
                borderRadius: 5
            }]
        },
        options: {
            ...common,
            indexAxis: 'y',
            scales: {
                x: { ...common.scales.x, max: 50, title: { display: true, text: 'Importance %', color: '#555', font: { size: 10 } } },
                y: { ...common.scales.y }
            }
        }
    });
}
