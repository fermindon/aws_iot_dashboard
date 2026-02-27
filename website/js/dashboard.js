// IoT Device Dashboard
class DeviceDashboard {
  constructor() {
    this.devices = new Map(); // deviceId -> { messages: [], timestamps: [], temperatures: [], humidities: [], pressures: [] }
    this.selectedDeviceId = null;
    this.charts = {}; // temperature, humidity, pressure
    this.maxDataPoints = 50; // Limit chart data points
    this.queryApiEndpoint = null;
    this.darkMode = localStorage.getItem('darkMode') === 'true';
    
    this.initializeElements();
    this.loadApiEndpoint();
    this.applyDarkMode();
    this.attachEventListeners();
  }

  async loadApiEndpoint() {
    try {
      const res = await fetch('/config.json');
      if (res.ok) {
        const cfg = await res.json();
        this.queryApiEndpoint = cfg.queryApiEndpoint;
        // Load all known devices from API
        await this.loadAllDevices();
      }
    } catch (e) {
      console.warn('Could not load API endpoint from config');
    }
  }

  async loadAllDevices() {
    if (!this.queryApiEndpoint) return;
    
    try {
      const url = `${this.queryApiEndpoint}/devices`;
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        
        // Parse the body if it's a string (API Gateway response)
        let devices = data;
        if (typeof data.body === 'string') {
          devices = JSON.parse(data.body);
        }
        
        // Initialize empty device objects for all known devices
        if (devices.devices) {
          devices.devices.forEach(deviceId => {
            if (!this.devices.has(deviceId)) {
              this.devices.set(deviceId, {
                messages: [],
                timestamps: [],
                temperatures: [],
                humidities: [],
                pressures: [],
                count: 0
              });
            }
          });
          
          this.updateDeviceCount();
          this.renderDeviceList();
        }
      }
    } catch (e) {
      console.warn('Could not load device list from API:', e);
    }
  }

  initializeElements() {
    this.deviceListEl = document.getElementById('device-list');
    this.messagesEl = document.getElementById('messages');
    this.deviceCountEl = document.getElementById('device-count');
    this.lastUpdateEl = document.getElementById('last-update');
    this.deviceHeaderEl = document.getElementById('device-header');
    this.deviceMetricsEl = document.getElementById('device-metrics');
    this.tabsContainerEl = document.getElementById('tabs-container');
    this.statusBadgeEl = document.getElementById('connection-status');
  }

  attachEventListeners() {
    // Extend the global onWebSocketMessage to update dashboard
    const originalCallback = window.onWebSocketMessage;
    window.onWebSocketMessage = (msg) => {
      if (originalCallback) originalCallback(msg);
      this.addMessage(msg);
    };

    // Extend connection status updates
    const originalSetStatus = window.setWebSocketStatus;
    window.setWebSocketStatus = (status) => {
      if (originalSetStatus) originalSetStatus(status);
      this.updateConnectionStatus(status);
    };

    // Dark mode toggle
    const darkModeBtn = document.getElementById('dark-mode-toggle');
    if (darkModeBtn) {
      darkModeBtn.addEventListener('click', () => this.toggleDarkMode());
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Modal close handlers
    const modal = document.getElementById('message-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    }
  }

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode);
    this.applyDarkMode();
  }

  applyDarkMode() {
    const html = document.documentElement;
    if (this.darkMode) {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.setAttribute('data-theme', 'light');
    }
    // Refresh charts if they exist
    if (this.selectedDeviceId) {
      this.updateCharts(this.selectedDeviceId);
    }
  }

  updateConnectionStatus(status) {
    if (status === 'connected') {
      this.statusBadgeEl.textContent = 'Connected';
      this.statusBadgeEl.className = 'status-badge connected';
    } else {
      this.statusBadgeEl.textContent = 'Disconnected';
      this.statusBadgeEl.className = 'status-badge disconnected';
    }
  }

  addMessage(msg) {
    try {
      // Extract device ID and data
      const deviceId = msg.data?.deviceId || msg.topic?.split('/')[0] || 'unknown';
      
      // Initialize device if not exists
      if (!this.devices.has(deviceId)) {
        this.devices.set(deviceId, {
          messages: [],
          timestamps: [],
          temperatures: [],
          humidities: [],
          pressures: [],
          count: 0
        });
        this.renderDeviceList();
      }

      const device = this.devices.get(deviceId);
      device.messages.unshift(msg); // Add to front (newest first)
      device.count += 1;
      
      // Parse sensor values from message
      const sensorData = this.parseSensorData(msg);
      const now = new Date();
      
      device.timestamps.unshift(now);
      device.temperatures.unshift(sensorData.temperature);
      device.humidities.unshift(sensorData.humidity);
      device.pressures.unshift(sensorData.pressure);
      
      // Limit data points
      if (device.timestamps.length > this.maxDataPoints) {
        device.timestamps = device.timestamps.slice(0, this.maxDataPoints);
        device.messages = device.messages.slice(0, this.maxDataPoints);
        device.temperatures = device.temperatures.slice(0, this.maxDataPoints);
        device.humidities = device.humidities.slice(0, this.maxDataPoints);
        device.pressures = device.pressures.slice(0, this.maxDataPoints);
      }

      this.updateDeviceCount();
      this.updateLastUpdate();

      // If this device is selected, update the display
      if (this.selectedDeviceId === deviceId) {
        this.updateDeviceDisplay(deviceId);
      }

      // Always update raw messages display
      this.renderRawMessages();
    } catch (e) {
      console.error('Error processing message:', e);
    }
  }

  parseSensorData(msg) {
    let temperature = null;
    let humidity = null;
    let pressure = null;

    // First try to get from top-level attributes (from updated Lambda)
    temperature = msg.temperature !== undefined ? parseFloat(msg.temperature) : null;
    humidity = msg.humidity !== undefined ? parseFloat(msg.humidity) : null;
    pressure = msg.pressure !== undefined ? parseFloat(msg.pressure) : null;

    // Fallback: parse from message JSON if not in top-level
    if (temperature === null || humidity === null || pressure === null) {
      try {
        let payload = msg.message || msg.data?.message || '{}';
        
        // If it's a string, parse it
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch (e) {
            return { temperature, humidity, pressure };
          }
        }

        // Extract values if not already set
        if (temperature === null) {
          temperature = payload.temperature !== undefined ? parseFloat(payload.temperature) : null;
        }
        if (humidity === null) {
          humidity = payload.humidity !== undefined ? parseFloat(payload.humidity) : null;
        }
        if (pressure === null) {
          pressure = payload.pressure !== undefined ? parseFloat(payload.pressure) : null;
        }
      } catch (e) {
        console.warn('Could not parse sensor data:', e);
      }
    }

    return { temperature, humidity, pressure };
  }

  renderDeviceList() {
    this.deviceListEl.innerHTML = '';
    
    // Sort devices by when they were last seen, but show all devices
    const sortedDevices = Array.from(this.devices.entries())
      .sort((a, b) => {
        // Devices with messages first, then by timestamp
        const aHasMsg = a[1].messages.length > 0;
        const bHasMsg = b[1].messages.length > 0;
        if (aHasMsg !== bHasMsg) return aHasMsg ? -1 : 1;
        return (b[1].messages[0]?.timestamp || 0) - (a[1].messages[0]?.timestamp || 0);
      });

    sortedDevices.forEach(([deviceId, data]) => {
      const item = document.createElement('div');
      item.className = 'device-item';
      if (this.selectedDeviceId === deviceId) {
        item.classList.add('active');
      }
      
      // Show count or 'waiting' indicator
      const count = data.count > 0 ? `(${data.count})` : '(waiting...)';
      item.textContent = `${deviceId} ${count}`;
      item.addEventListener('click', () => this.selectDevice(deviceId));
      this.deviceListEl.appendChild(item);
    });
  }

  async selectDevice(deviceId) {
    this.selectedDeviceId = deviceId;
    this.renderDeviceList();
    
    // Load historical data from API if available
    if (this.queryApiEndpoint) {
      await this.loadHistoricalData(deviceId);
    }
    
    this.updateDeviceDisplay(deviceId);
  }

  async loadHistoricalData(deviceId) {
    try {
      const url = `${this.queryApiEndpoint}/messages?deviceId=${encodeURIComponent(deviceId)}&limit=100`;
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        
        // Parse the body if it's a string (API Gateway response)
        let messages = data;
        if (typeof data.body === 'string') {
          messages = JSON.parse(data.body);
        }
        
        // Add historical messages to device
        const device = this.devices.get(deviceId);
        if (device && messages.messages) {
          // Add messages that aren't already there
          messages.messages.forEach(msg => {
            const exists = device.messages.some(m => m.id === msg.id);
            if (!exists) {
              device.messages.push(msg);
              const ts = new Date(msg.timestamp);
              device.timestamps.push(ts);
              
              // Parse sensor values from message
              const sensorData = this.parseSensorData(msg);
              device.temperatures.push(sensorData.temperature);
              device.humidities.push(sensorData.humidity);
              device.pressures.push(sensorData.pressure);
            }
          });
          
          // Sort by timestamp (newest first)
          device.messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          device.timestamps.sort((a, b) => b - a);
          
          // Reverse the other arrays to match timestamp order
          const indices = device.timestamps.map(ts => 
            device.messages.findIndex(m => new Date(m.timestamp).getTime() === ts.getTime())
          );
          device.temperatures = indices.map((i, idx) => device.temperatures[i] !== undefined ? device.temperatures[i] : null).reverse();
          device.humidities = indices.map((i, idx) => device.humidities[i] !== undefined ? device.humidities[i] : null).reverse();
          device.pressures = indices.map((i, idx) => device.pressures[i] !== undefined ? device.pressures[i] : null).reverse();
          
          // Limit chart data
          if (device.timestamps.length > this.maxDataPoints) {
            device.timestamps = device.timestamps.slice(0, this.maxDataPoints);
            device.messages = device.messages.slice(0, this.maxDataPoints);
            device.temperatures = device.temperatures.slice(0, this.maxDataPoints);
            device.humidities = device.humidities.slice(0, this.maxDataPoints);
            device.pressures = device.pressures.slice(0, this.maxDataPoints);
          }
        }
      }
    } catch (e) {
      console.warn(`Could not load historical data for ${deviceId}:`, e);
    }
  }

  updateDeviceDisplay(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Update device header
    this.deviceHeaderEl.innerHTML = `<h2>📱 Device: <code>${escapeHtml(deviceId)}</code></h2>`;

    // Calculate date range
    let dateRange = '--';
    if (device.timestamps.length > 0) {
      const oldest = device.timestamps[device.timestamps.length - 1];
      const newest = device.timestamps[0];
      dateRange = `${oldest.toLocaleString()} → ${newest.toLocaleString()}`;
    }

    // Update metrics
    const lastUpdate = device.timestamps[0] ? device.timestamps[0].toLocaleTimeString() : '--';
    
    document.getElementById('metric-count').textContent = device.count;
    document.getElementById('metric-date-range').textContent = dateRange;
    document.getElementById('metric-last-update').textContent = lastUpdate;

    this.deviceMetricsEl.style.display = 'grid';
    this.tabsContainerEl.style.display = 'block';

    // Update charts
    this.updateCharts(deviceId);
  }

  updateCharts(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Prepare data
    const labels = device.timestamps.map(ts => ts.toLocaleTimeString());
    const temperatureData = device.temperatures;
    const humidityData = device.humidities;
    const pressureData = device.pressures;

    // Update or create temperature chart
    this.updateChart('temperature', labels, temperatureData, '🌡️ Temperature (°C)', '#e74c3c');

    // Update or create humidity chart
    this.updateChart('humidity', labels, humidityData, '💧 Humidity (%)', '#3498db');

    // Update or create pressure chart
    this.updateChart('pressure', labels, pressureData, '🔵 Pressure (hPa)', '#f39c12');
  }

  updateChart(type, labels, data, label, color) {
    const canvasId = `${type}-chart`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (this.charts[type]) {
      this.charts[type].destroy();
    }

    // Create new chart
    this.charts[type] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          borderColor: color,
          backgroundColor: this.hexToRgba(color, 0.1),
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: color,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          spanGaps: true // Allow gaps for null values
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const elementIndex = elements[0].index;
            const device = this.devices.get(this.selectedDeviceId);
            if (device && device.messages[elementIndex]) {
              this.showRawMessage(device.messages[elementIndex]);
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              usePointStyle: true,
              padding: 15,
              color: this.darkMode ? '#f1f5f9' : '#1a202c'
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: label
            },
            ticks: {
              color: this.darkMode ? '#cbd5e1' : '#6b7280'
            },
            grid: {
              color: this.darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(200, 200, 200, 0.1)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time'
            },
            ticks: {
              color: this.darkMode ? '#cbd5e1' : '#6b7280'
            },
            grid: {
              color: this.darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(200, 200, 200, 0.1)'
            }
          }
        }
      }
    });
  }

  showRawMessage(message) {
    const modal = document.getElementById('message-modal');
    const content = document.getElementById('message-content');
    content.textContent = JSON.stringify(message, null, 2);
    modal.style.display = 'flex';
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  switchTab(tabName) {
    // Update active button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Trigger chart resize/redraw
    setTimeout(() => {
      if (this.charts[tabName]) {
        this.charts[tabName].resize();
      }
    }, 0);
  }

  renderRawMessages() {
    this.messagesEl.innerHTML = '';

    // Collect all messages and sort by time (newest first)
    const allMessages = [];
    this.devices.forEach((device, _) => {
      device.messages.forEach(msg => {
        allMessages.push(msg);
      });
    });
    allMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Limit to last 20 messages
    const recentMessages = allMessages.slice(0, 20);

    recentMessages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'message-item';
      item.textContent = JSON.stringify(msg, null, 2);
      this.messagesEl.appendChild(item);
    });
  }

  updateDeviceCount() {
    this.deviceCountEl.textContent = this.devices.size;
  }

  updateLastUpdate() {
    this.lastUpdateEl.textContent = new Date().toLocaleTimeString();
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new DeviceDashboard();
});
