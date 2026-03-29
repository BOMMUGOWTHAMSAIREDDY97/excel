const CONFIG = {
    POLL_INTERVAL: 1500,
    HISTORY_LEN: 25,
    THRESHOLDS: {
        TEMP_WARM: 42,
        TEMP_CRIT: 52,
        VOLT_LOW: 3.2,
        CURR_HIGH: 8.0
    }
};

// Supabase Configuration - REPLACE WITH YOUR ACTUAL CREDENTIALS
const SUPABASE_URL = 'https://jmknmbgssiztxzdttsmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let charts = {};
let gauges = {};
let history = { v: [], c: [], t: [], s: [], l: [] };

// Simulated State
let sim = {
    voltage: 3.9, current: 2.1, temp: 38, soc: 82, soh: 94, rul: 260, fan: false, relay: true
};

// Initialize
window.onload = () => {
    initCharts();
    initSpeedos();
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
        plugins: { legend: { display: false } },
        scales: {
            x: { display: false },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#555', font: { size: 9 } } }
        },
        elements: { line: { tension: 0.4, borderWidth: 2, fill: true }, point: { radius: 0 } }
    };

    charts.v = new Chart(document.getElementById('chart-v'), {
        type: 'line',
        data: { labels: [], datasets: [{ borderColor: '#00f2ff', backgroundColor: 'rgba(0, 242, 255, 0.05)', data: [] }] },
        options: common
    });
    charts.c = new Chart(document.getElementById('chart-c'), {
        type: 'line',
        data: { labels: [], datasets: [{ borderColor: '#ffdb29', backgroundColor: 'rgba(255, 219, 41, 0.05)', data: [] }] },
        options: common
    });
    charts.t = new Chart(document.getElementById('chart-t'), {
        type: 'line',
        data: { labels: [], datasets: [{ borderColor: '#ff3c3c', backgroundColor: 'rgba(255, 60, 60, 0.05)', data: [] }] },
        options: common
    });
    charts.s = new Chart(document.getElementById('chart-s'), {
        type: 'line',
        data: { labels: [], datasets: [{ borderColor: '#00ff8c', backgroundColor: 'rgba(0, 255, 140, 0.05)', data: [] }] },
        options: common
    });
}

// 2. Custom Canvas Speedometers
function initSpeedos() {
    gauges.v = { ctx: document.getElementById('gauge-voltage').getContext('2d'), val: 0, max: 4.5 };
    gauges.t = { ctx: document.getElementById('gauge-temp').getContext('2d'), val: 0, max: 80 };
}

function drawSpeedo(config, value, color) {
    const { ctx, max } = config;
    ctx.clearRect(0, 0, 300, 300);
    const centerX = 70; const centerY = 65; const radius = 55;

    // Track (Back)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Fill
    const percent = Math.min(value / max, 1);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, Math.PI + (percent * Math.PI));
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.stroke();
}

// 3. Supabase Integration
async function initSupabase() {
    // 1. Fetch initial state (last 25 records to populate charts)
    const { data, error } = await supabaseClient
        .from('battery_data')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(CONFIG.HISTORY_LEN);

    if (error) {
        console.error('Supabase fetch error:', error);
        logEvent('DB CONNECTION ERROR', 'crit');
        // Fallback to simulation if DB fails initially
        mainLoopFallback();
        return;
    }

    if (data && data.length > 0) {
        // Populate history from initial fetch (reverse to get chronological order)
        data.reverse().forEach(row => {
            const mappedData = mapSupabaseData(row);
            updateHistory(mappedData);
        });

        // Update UI with the latest record
        const latest = mapSupabaseData(data[data.length - 1]);
        updateUI(latest);
        checkAlerts(latest);

        document.getElementById('conn-text').innerText = "LIVE (SUPABASE)";
        document.getElementById('connection-status').className = "status-pill connected";
    }

    // 2. Subscribe to real-time changes
    supabaseClient
        .channel('battery-updates')
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
}

// Map database column names to our app's internal names
function mapSupabaseData(row) {
    return {
        voltage: row.voltage || 0,
        current: row.current || 0,
        temp: row.temperature || row.temp || 0, // handles both naming variants
        soc: row.soc || 0,
        soh: row.soh || 0,
        rul: row.rul || 250, // default if not in table
        fan: row.temp > 45,  // derived logic if column missing
        relay_status: row.relay_status !== undefined ? row.relay_status : true,
        created_at: row.created_at
    };
}

// Fallback to simulation if Supabase fails
async function mainLoopFallback() {
    setInterval(async () => {
        const data = simulate();
        document.getElementById('conn-text').innerText = "EMULATED STREAM";
        document.getElementById('connection-status').className = "status-pill simulated";
        updateUI(data);
        updateHistory(data);
        checkAlerts(data);
    }, CONFIG.POLL_INTERVAL);
}

function simulate() {
    sim.voltage += (Math.random() - 0.5) * 0.05;
    sim.current = 1.0 + Math.random() * 2.5;
    sim.temp += (Math.random() - 0.5) * 0.4;
    sim.soc -= 0.01;
    if (sim.temp > 45) { sim.fan = true; sim.temp -= 0.6; } else sim.fan = false;
    if (sim.voltage < 3.3) sim.voltage = 3.3;
    return sim;
}

// 4. Update Visuals
function updateUI(data) {
    // Master Battery
    const fill = document.getElementById('battery-fill-master');
    fill.style.height = `${data.soc}%`;
    document.getElementById('soc-value-master').innerText = Math.round(data.soc);

    if (data.soc < 20) fill.style.backgroundColor = 'var(--accent-red)';
    else if (data.soc < 45) fill.style.backgroundColor = 'var(--accent-yellow)';
    else fill.style.backgroundColor = 'var(--accent-green)';

    // Stats
    document.getElementById('stat-current').innerText = data.current.toFixed(2);
    document.getElementById('stat-power').innerText = (data.voltage * data.current).toFixed(2);
    document.getElementById('stat-temp').innerText = Math.round(data.temp);
    document.getElementById('rul-val').innerText = data.rul;

    // Gauges
    document.getElementById('val-v').innerText = data.voltage.toFixed(2);
    document.getElementById('val-t').innerText = Math.round(data.temp);
    drawSpeedo(gauges.v, data.voltage, '#00f2ff');
    drawSpeedo(gauges.t, data.temp, data.temp > 50 ? '#ff3c3c' : '#ffdb29');

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
    const carImg = document.getElementById('ev-car-img');
    const glow = document.getElementById('battery-glow');
    if (data.soh < 85) glow.style.background = 'var(--accent-yellow)';
    else if (data.soh < 75) glow.style.background = 'var(--accent-red)';
    else glow.style.background = 'var(--accent-green)';

    document.getElementById('soh-bar').style.width = `${data.soh}%`;
    document.getElementById('soh-percent-label').innerText = `${data.soh}%`;
}

function updateHistory(data) {
    const time = new Date().toLocaleTimeString();
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
    charts.v.update('none');

    charts.c.data.labels = history.l;
    charts.c.data.datasets[0].data = history.c;
    charts.c.update('none');

    charts.t.data.labels = history.l;
    charts.t.data.datasets[0].data = history.t;
    charts.t.update('none');

    charts.s.data.labels = history.l;
    charts.s.data.datasets[0].data = history.s;
    charts.s.update('none');

    // Summary Stats in Chart headers
    document.getElementById('v-avg').innerText = `Avg: ${(history.v.reduce((a, b) => a + b) / history.v.length).toFixed(2)}V`;
    document.getElementById('c-peak').innerText = `Peak: ${Math.max(...history.c).toFixed(1)}A`;
    document.getElementById('t-max').innerText = `Max: ${Math.round(Math.max(...history.t))}°C`;

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

    if (data.temp > CONFIG.THRESHOLDS.TEMP_CRIT) {
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
