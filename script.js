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

// Initialize
window.onload = () => {
    initCharts();
    initSpeedos();
    initAICharts();
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
            x: { display: true, ticks: { color: '#555', font: { size: 8 }, maxTicksLimit: 12, maxRotation: 0 }, grid: { display: false } },
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

        // Fetch more data for AI analysis (500 rows for full variation)
        const { data: aiRawData } = await supabaseClient
            .from('battery_data')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);
        
        if (aiRawData && aiRawData.length > 0) {
            // Reverse to chronological order (oldest first)
            aiRawData.reverse();
            window.aiRawDataPointer = aiRawData; // Store for real-time buffer
            logEvent('AI ENGINE: ANALYZING ' + aiRawData.length + ' SAMPLES', 'system');
            runAIAnalytics(aiRawData);
        }
    } else {
        logEvent('REMOTE TABLE EMPTY - WAITING FOR ESP32...', 'warn');
        document.getElementById('conn-text').innerText = "WAITING FOR DATA";
        mainLoopFallback();
    }

    // 2. Subscribe to real-time changes (Unique channel for reliability)
    const channelId = 'bms-live-' + Math.random().toString(36).substring(7);
    
    // Use the 500 rows (aiRawData) for the AI buffer, or fallback to the 200 rows (data)
    let realtimeBuffer = (window.aiRawDataPointer) ? [...window.aiRawDataPointer] : (data ? [...data] : []);
    
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

                // Update AI analytics with new data
                realtimeBuffer.push(payload.new);
                if (realtimeBuffer.length > 500) realtimeBuffer.shift();
                runAIAnalytics(realtimeBuffer);
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

// ============================================================
// 6. AI PREDICTIVE ANALYTICS ENGINE
// ============================================================
let aiCharts = {};
let aiData = { sohHistory: [], rulHistory: [], voltTemps: [] };

function initAICharts() {
    const aiCommon = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeOutQuart' },
        plugins: {
            legend: { display: true, labels: { color: '#aaa', font: { size: 10, family: 'Inter' } } },
            tooltip: {
                backgroundColor: 'rgba(20, 10, 40, 0.95)',
                titleFont: { family: 'Orbitron', size: 11 },
                bodyFont: { family: 'Inter' },
                borderColor: 'rgba(168, 85, 247, 0.3)',
                borderWidth: 1
            }
        },
        layout: { padding: 30 }
    };

    // 1. SOH Degradation Forecast (Line chart with prediction)
    aiCharts.soh = new Chart(document.getElementById('chart-ai-soh'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Actual SOH',
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    data: [],
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 3,
                    pointBackgroundColor: '#a855f7'
                },
                {
                    label: 'Predicted SOH',
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.05)',
                    data: [],
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 2,
                    pointBackgroundColor: '#06b6d4'
                }
            ]
        },
        options: {
            ...aiCommon,
            scales: {
                x: { display: true, ticks: { color: '#555', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.03)' } },
                y: { beginAtZero: false, grace: '5%', ticks: { color: '#888', font: { size: 9 } }, grid: { color: 'rgba(168,85,247,0.08)' } }
            }
        }
    });

    // 2. Battery Health Radar (Removed Stability, Added Power Flow)
    aiCharts.radar = new Chart(document.getElementById('chart-ai-radar'), {
        type: 'radar',
        data: {
            labels: ['Voltage', 'Current', 'Temperature', 'SOC', 'SOH', 'Power Flow'],
            datasets: [{
                label: 'Health Index',
                data: [0, 0, 0, 0, 0, 0],
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                borderWidth: 2,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#fff',
                pointRadius: 4
            }]
        },
        options: {
            ...aiCommon,
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { color: '#555', backdropColor: 'transparent', stepSize: 25, font: { size: 8 } },
                    grid: { color: 'rgba(168, 85, 247, 0.1)' },
                    angleLines: { color: 'rgba(168, 85, 247, 0.15)' },
                    pointLabels: { color: '#aaa', font: { size: 10, family: 'Inter' } }
                }
            }
        }
    });

    // 3. RUL Prediction Timeline (Bar chart)
    aiCharts.rul = new Chart(document.getElementById('chart-ai-rul'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Predicted RUL (cycles)',
                data: [],
                backgroundColor: [],
                borderColor: 'rgba(168, 85, 247, 0.5)',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            ...aiCommon,
            scales: {
                x: { ticks: { color: '#555', font: { size: 9 }, maxTicksLimit: 12 }, grid: { display: false } },
                y: { min: 0, ticks: { color: '#888', font: { size: 9 } }, grid: { color: 'rgba(168,85,247,0.08)' } }
            }
        }
    });

    // 4. AI Dynamic Mode Analyst (Changes automatically)
    aiCharts.mode = new Chart(document.getElementById('chart-ai-mode'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Mode Metric',
                data: [],
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: aiCommon
    });
}

// AI Analytics — called with real Supabase data
function runAIAnalytics(allData) {
    if (!allData || allData.length < 2) return;

    // Force chronological sort to prevent time-jumps
    allData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const statusEl = document.getElementById('ai-status');
    statusEl.innerText = `Analyzing ${allData.length} data points from Supabase...`;

    // ── Extract arrays from real data ──
    const voltages = allData.map(d => Number(d.voltage));
    const currents = allData.map(d => Math.abs(Number(d.current)));
    const temps = allData.map(d => Number(d.temperature));
    const socs = allData.map(d => Number(d.soc));
    const sohs = allData.map(d => Number(d.soh));
    const times = allData.map(d => {
        const dt = new Date(d.created_at);
        return dt.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true 
        });
    });

    // ── 1. SOH Degradation Forecast ──
    const sohLabels = [...times];
    const sohActual = [...sohs];
    const sohPredicted = [...sohs];

    // Predict future SOH using linear regression
    const n = sohs.length;
    const avgSOH = sohs.reduce((a, b) => a + b, 0) / n;
    const indices = sohs.map((_, i) => i);
    const avgIdx = indices.reduce((a, b) => a + b, 0) / n;
    let slope = 0;
    let denom = 0;
    for (let i = 0; i < n; i++) {
        slope += (indices[i] - avgIdx) * (sohs[i] - avgSOH);
        denom += (indices[i] - avgIdx) ** 2;
    }
    slope = denom !== 0 ? slope / denom : -0.01;
    const intercept = avgSOH - slope * avgIdx;

    // Add 10 future predictions
    for (let i = 1; i <= 10; i++) {
        sohLabels.push(`+${i * 10}min`);
        sohActual.push(null);
        const predicted = Math.max(80, intercept + slope * (n + i * 5));
        sohPredicted.push(Number(predicted.toFixed(1)));
    }

    aiCharts.soh.data.labels = sohLabels;
    aiCharts.soh.data.datasets[0].data = sohActual;
    aiCharts.soh.data.datasets[1].data = sohPredicted;
    aiCharts.soh.update();

    const trendDir = slope >= 0 ? '📈 Stable' : '📉 Degrading';
    document.getElementById('ai-soh-trend').innerText = `${trendDir} (${(slope * 100).toFixed(3)}%/sample)`;

    // ── 2. Battery Health Radar (Stability -> Power Flow) ──
    const latestV = voltages[voltages.length - 1];
    const latestI = currents[currents.length - 1];
    const latestT = temps[temps.length - 1];
    const latestSOC = socs[socs.length - 1];
    const latestSOH = sohs[sohs.length - 1];

    // Normalize to 0-100 scale
    const vScore = Math.min(100, Math.max(0, ((latestV - 3.0) / 1.2) * 100));
    const iScore = Math.min(100, Math.max(0, 100 - (latestI / 5) * 100));
    const tScore = Math.min(100, Math.max(0, 100 - ((latestT - 20) / 40) * 100));
    const socScore = latestSOC;
    const sohScore = latestSOH;

    // Power Flow (New metric replacing Stability)
    const powerFlow = latestV * latestI;
    const powerFlowScore = Math.min(100, (powerFlow / 20) * 100);

    aiCharts.radar.data.datasets[0].data = [
        vScore.toFixed(0), iScore.toFixed(0), tScore.toFixed(0),
        socScore.toFixed(0), sohScore.toFixed(0), powerFlowScore.toFixed(0)
    ];
    aiCharts.radar.update();

    // ── 3. RUL Prediction Timeline ──
    const rulLabels = times.slice(-15);
    const rulData = socs.slice(-15).map((soc, i) => {
        const baseCycles = 250;
        const tempPenalty = Math.max(0, (temps[temps.length - 15 + i] || 30) - 30) * 2;
        const socFactor = soc / 100;
        return Math.max(50, Math.round(baseCycles * socFactor - tempPenalty));
    });

    const rulColors = rulData.map(v => {
        if (v > 180) return 'rgba(0, 255, 140, 0.7)';
        if (v > 120) return 'rgba(255, 219, 41, 0.7)';
        return 'rgba(255, 60, 60, 0.7)';
    });

    aiCharts.rul.data.labels = rulLabels;
    aiCharts.rul.data.datasets[0].data = rulData;
    aiCharts.rul.data.datasets[0].backgroundColor = rulColors;
    aiCharts.rul.update();

    const avgRUL = Math.round(rulData.reduce((a, b) => a + b, 0) / rulData.length);
    document.getElementById('ai-rul-trend').innerText = `Avg: ${avgRUL} cycles`;

    // ── 4. AI Dynamic Mode Analyst (AUTO-SWITCHING) ──
    const latestRawI = Number(allData[allData.length - 1].current);
    const modeHeader = document.getElementById('ai-mode-header');
    const modeType = document.getElementById('ai-mode-type');
    
    let modeData = [];
    let modeLabel = "";
    
    if (latestRawI > 0.02) {
        // CHARGING MODE
        modeHeader.innerText = "⚡ Charging Efficiency";
        modeType.innerText = "Active Charge Phase";
        modeLabel = "C-Rate Score";
        modeData = currents.slice(-15).map(c => Math.min(100, (c / 2) * 100));
    } else if (latestRawI < -0.02) {
        // DISCHARGE MODE
        modeHeader.innerText = "🔋 Discharge Stability";
        modeType.innerText = "Active Load Phase";
        modeLabel = "Thermal Impact";
        modeData = temps.slice(-15).map(t => Math.max(0, 100 - (t - 30) * 5));
    } else {
        // IDLE MODE
        modeHeader.innerText = "💤 Standby Retention";
        modeType.innerText = "Idle/Dormant Phase";
        modeLabel = "Voltage Flatness";
        modeData = voltages.slice(-15).map(v => 100 - (v % 0.1) * 100);
    }

    aiCharts.mode.data.labels = times.slice(-15);
    aiCharts.mode.data.datasets[0].label = modeLabel;
    aiCharts.mode.data.datasets[0].data = modeData;
    aiCharts.mode.update();

    // ── Update KPI Cards ──
    const healthScore = ((vScore + iScore + tScore + socScore + sohScore + powerFlowScore) / 6).toFixed(0);
    document.getElementById('ai-health-score').innerText = healthScore + '%';

    const anomalyEl = document.getElementById('ai-anomaly-risk');
    if (latestT > 45 || latestV < 3.2) {
        anomalyEl.innerText = 'HIGH';
        anomalyEl.style.color = 'var(--accent-red)';
    } else if (latestT > 38 || latestV < 3.5) {
        anomalyEl.innerText = 'MEDIUM';
        anomalyEl.style.color = 'var(--accent-yellow)';
    } else {
        anomalyEl.innerText = 'LOW';
        anomalyEl.style.color = 'var(--accent-green)';
    }

    document.getElementById('ai-rul-pred').innerText = avgRUL + ' cyc';

    // Fixed efficiency calculation (replaced stabilityScore with powerFlowScore)
    const efficiency = Math.min(100, Math.round((latestSOC + latestSOH + powerFlowScore) / 3));
    document.getElementById('ai-efficiency').innerText = efficiency + '%';
    document.getElementById('ai-efficiency').innerText = efficiency + '%';

    statusEl.innerText = `✅ Analysis complete — ${allData.length} samples processed`;
    logEvent('AI ANALYTICS UPDATED', 'system');
}