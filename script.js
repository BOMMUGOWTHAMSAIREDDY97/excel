// Configuration & Mock Data
const CONFIG = {
    POLL_INTERVAL: 1000,
    CHART_POINTS: 20,
    THRESHOLDS: {
        TEMP_WARNING: 45,
        TEMP_CRITICAL: 55,
        VOLT_CRITICAL: 3.0,
        CURR_WARNING: 10.0
    }
};

let charts = {};
let dataHistory = {
    voltage: [],
    temp: [],
    soc: [],
    labels: []
};

// Simulation State
let simState = {
    voltage: 3.8,
    current: 1.5,
    temp: 35,
    soc: 85,
    soh: 94,
    rul: 280,
    fan_status: false,
    relay_status: true
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    startClock();
    startDataLoop();
});

// 1. Clock functionality
function startClock() {
    const clockEl = document.getElementById('clock');
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
    }, 1000);
}

// 2. chart.js Initialization
function initCharts() {
    const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#a0a0a0', font: { size: 10 } }
            },
            x: {
                grid: { display: false },
                ticks: { display: false }
            }
        },
        elements: {
            line: { tension: 0.4, borderWidth: 2, fill: true },
            point: { radius: 0 }
        }
    };

    // Voltage Chart
    charts.voltage = new Chart(document.getElementById('voltageChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#00b4d8',
                backgroundColor: 'rgba(0, 180, 216, 0.1)'
            }]
        },
        options: chartDefaults
    });

    // Temp Chart
    charts.temp = new Chart(document.getElementById('tempChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#ff1744',
                backgroundColor: 'rgba(255, 23, 68, 0.1)'
            }]
        },
        options: chartDefaults
    });

    // SOC Chart
    charts.soc = new Chart(document.getElementById('socChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#00e676',
                backgroundColor: 'rgba(0, 230, 118, 0.1)'
            }]
        },
        options: chartDefaults
    });
}

// 3. Data Loop (Fetch or Simulate)
async function startDataLoop() {
    setInterval(async () => {
        let batteryData;
        try {
            const response = await fetch('/api/battery');
            if (response.ok) {
                batteryData = await response.json();
                document.getElementById('connection-status').className = 'status-pill status-connected';
            } else {
                throw new Error('API Offline');
            }
        } catch (error) {
            // Fallback to simulation
            batteryData = simulateData();
            document.getElementById('connection-status').className = 'status-pill status-simulated';
            document.querySelector('.status-text').textContent = 'SIMULATED';
        }

        updateUI(batteryData);
        updateCharts(batteryData);
        checkFaults(batteryData);
    }, CONFIG.POLL_INTERVAL);
}

// 4. Update UI Elements
function updateUI(data) {
    // Basic Metrics
    document.getElementById('voltage-value').textContent = data.voltage.toFixed(2);
    document.getElementById('current-value').textContent = data.current.toFixed(1);
    document.getElementById('temp-value').textContent = Math.round(data.temp);
    document.getElementById('soc-value').textContent = Math.round(data.soc);
    document.getElementById('soh-value').textContent = Math.round(data.soh);
    document.getElementById('rul-value').textContent = data.rul;

    // Gauges (282.7 is Circumference of 45r circle)
    updateGauge('soc-gauge', data.soc);
    updateGauge('soh-gauge', data.soh);

    // Status Tags
    const fan = document.getElementById('fan-indicator');
    fan.textContent = data.fan_status ? 'ON' : 'OFF';
    fan.className = `status-tag ${data.fan_status ? 'on' : 'off'}`;

    const relay = document.getElementById('relay-indicator');
    relay.textContent = data.relay_status ? 'CONNECTED' : 'DISCONNECTED';
    relay.className = `status-tag ${data.relay_status ? 'connected' : 'off'}`;
}

function updateGauge(id, percent) {
    const gauge = document.getElementById(id);
    const offset = 282.7 - (percent / 100 * 282.7);
    gauge.style.strokeDashoffset = offset;
}

// 5. Update Charts
function updateCharts(data) {
    const timeLabel = new Date().toLocaleTimeString();
    
    // Manage History
    dataHistory.voltage.push(data.voltage);
    dataHistory.temp.push(data.temp);
    dataHistory.soc.push(data.soc);
    dataHistory.labels.push(timeLabel);

    if (dataHistory.labels.length > CONFIG.CHART_POINTS) {
        dataHistory.voltage.shift();
        dataHistory.temp.shift();
        dataHistory.soc.shift();
        dataHistory.labels.shift();
    }

    // Refresh charts
    charts.voltage.data.labels = dataHistory.labels;
    charts.voltage.data.datasets[0].data = dataHistory.voltage;
    charts.voltage.update('none');

    charts.temp.data.labels = dataHistory.labels;
    charts.temp.data.datasets[0].data = dataHistory.temp;
    charts.temp.update('none');

    charts.soc.data.labels = dataHistory.labels;
    charts.soc.data.datasets[0].data = dataHistory.soc;
    charts.soc.update('none');

    // Update stats
    const avgVolt = dataHistory.voltage.reduce((a,b) => a+b, 0) / dataHistory.voltage.length;
    document.getElementById('chart-voltage-avg').textContent = `Avg: ${avgVolt.toFixed(2)}V`;
    
    const peakTemp = Math.max(...dataHistory.temp);
    document.getElementById('chart-temp-peak').textContent = `Peak: ${peakTemp.toFixed(1)}°C`;
}

// 6. Fault & Threshold Logic
function checkFaults(data) {
    const alerts = [];
    const banner = document.getElementById('alert-banner');
    const alertMsg = document.getElementById('alert-message');

    // Over Temp
    const faultOt = document.getElementById('fault-ot');
    if (data.temp > CONFIG.THRESHOLDS.TEMP_CRITICAL) {
        faultOt.className = 'fault-item critical';
        faultOt.querySelector('.fault-status').textContent = 'CRITICAL';
        alerts.push('CRITICAL overheat: Fan active.');
    } else if (data.temp > CONFIG.THRESHOLDS.TEMP_WARNING) {
        faultOt.className = 'fault-item warning';
        faultOt.querySelector('.fault-status').textContent = 'WARNING';
        alerts.push('High Temperature Warning.');
    } else {
        faultOt.className = 'fault-item';
        faultOt.querySelector('.fault-status').textContent = 'Normal';
    }

    // Over Voltage (Low Voltage check)
    const faultOv = document.getElementById('fault-ov');
    if (data.voltage < CONFIG.THRESHOLDS.VOLT_CRITICAL) {
        faultOv.className = 'fault-item critical';
        faultOv.querySelector('.fault-status').textContent = 'LOW VOLTAGE';
        alerts.push('Voltage below safety threshold!');
    } else {
        faultOv.className = 'fault-item';
        faultOv.querySelector('.fault-status').textContent = 'Normal';
    }

    // Over Current
    const faultOc = document.getElementById('fault-oc');
    if (data.current > CONFIG.THRESHOLDS.CURR_WARNING) {
        faultOc.className = 'fault-item warning';
        faultOc.querySelector('.fault-status').textContent = 'HIGH LOAD';
    } else {
        faultOc.className = 'fault-item';
        faultOc.querySelector('.fault-status').textContent = 'Normal';
    }

    // Display Alert Banner
    if (alerts.length > 0) {
        banner.classList.remove('hidden');
        alertMsg.textContent = alerts[0];
    } else {
        banner.classList.add('hidden');
    }
}

// 7. Simulation Engine
function simulateData() {
    // Fluctuations
    simState.voltage += (Math.random() - 0.5) * 0.02;
    simState.current += (Math.random() - 0.5) * 0.5;
    simState.temp += (Math.random() - 0.5) * 0.3;
    
    // Simulate Drain
    if (simState.current > 0) simState.soc -= 0.001;
    
    // Bounds
    if (simState.voltage < 3.2) simState.voltage = 3.2;
    if (simState.voltage > 4.2) simState.voltage = 4.2;
    if (simState.soc < 0) simState.soc = 0;
    
    // Logic: If temp > 45, fan turns on
    simState.fan_status = simState.temp > CONFIG.THRESHOLDS.TEMP_WARNING;
    if (simState.fan_status) simState.temp -= 0.1; // cooling effect

    return simState;
}
