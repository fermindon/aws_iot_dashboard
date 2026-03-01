import Chart from 'chart.js/auto';

// Type Definitions
interface SensorData {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
}

interface Message {
  id?: string;
  deviceId?: string;
  timestamp?: number;
  message?: Record<string, any>;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  data?: { deviceId?: string };
  topic?: string;
  [key: string]: any;
}

interface DeviceData {
  messages: Message[];
  timestamps: Date[];
  temperatures: (number | null)[];
  humidities: (number | null)[];
  pressures: (number | null)[];
  count: number;
}

interface ChartInstance {
  [key: string]: Chart<'line', (number | null)[], string>;
}

interface DeviceMetadata {
  deviceId: string;
  name?: string;
  location?: string;
  description?: string;
  sensorType?: string;
  firmwareVersion?: string;
}

interface Config {
  queryApiEndpoint?: string;
  [key: string]: any;
}

interface APIResponse {
  statusCode?: number;
  body?: string;
  [key: string]: any;
}

// IoT Device Dashboard
class DeviceDashboard {
  private devices: Map<string, DeviceData>;
  private deviceMetadata: Map<string, DeviceMetadata>;
  private selectedDeviceId: string | null;
  private charts: ChartInstance;
  private maxDataPoints: number;
  private queryApiEndpoint: string | null;
  private darkMode: boolean;

  // DOM Elements
  private deviceListEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private deviceCountEl!: HTMLElement;
  private lastUpdateEl!: HTMLElement;
  private deviceHeaderEl!: HTMLElement;
  private deviceMetricsEl!: HTMLElement;
  private tabsContainerEl!: HTMLElement;
  private statusBadgeEl!: HTMLElement;
  private infoNameEl!: HTMLInputElement;
  private infoLocationEl!: HTMLInputElement;
  private infoDescriptionEl!: HTMLTextAreaElement;
  private infoSensorTypeEl!: HTMLInputElement;
  private infoFirmwareEl!: HTMLInputElement;
  private saveDeviceInfoBtn!: HTMLElement;
  private saveStatusEl!: HTMLElement;

  constructor() {
    this.devices = new Map();
    this.deviceMetadata = new Map();
    this.selectedDeviceId = null;
    this.charts = {};
    this.maxDataPoints = 50;
    this.queryApiEndpoint = null;
    this.darkMode = localStorage.getItem('darkMode') === 'true';

    this.initializeElements();
    this.loadApiEndpoint();
    this.applyDarkMode();
    this.attachEventListeners();
  }

  private async loadApiEndpoint(): Promise<void> {
    try {
      const res = await fetch('/config.json');
      if (res.ok) {
        const cfg: Config = await res.json();
        this.queryApiEndpoint = cfg.queryApiEndpoint || null;
        await this.loadAllDevices();
      }
    } catch (e) {
      console.warn('Could not load API endpoint from config:', e);
    }
  }

  private async loadAllDevices(): Promise<void> {
    if (!this.queryApiEndpoint) return;

    try {
      const url = `${this.queryApiEndpoint}/devices`;
      const res = await fetch(url);

      if (res.ok) {
        let data: APIResponse = await res.json();

        // Parse body if it's a string
        let devices = data;
        if (typeof data.body === 'string') {
          devices = JSON.parse(data.body);
        }

        // Initialize device objects
        if ((devices as any).devices) {
          ((devices as any).devices as string[]).forEach((deviceId) => {
            if (!this.devices.has(deviceId)) {
              this.devices.set(deviceId, {
                messages: [],
                timestamps: [],
                temperatures: [],
                humidities: [],
                pressures: [],
                count: 0,
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

  private initializeElements(): void {
    this.deviceListEl = this.getElement('device-list');
    this.messagesEl = this.getElement('messages');
    this.deviceCountEl = this.getElement('device-count');
    this.lastUpdateEl = this.getElement('last-update');
    this.deviceHeaderEl = this.getElement('device-header');
    this.deviceMetricsEl = this.getElement('device-metrics');
    this.tabsContainerEl = this.getElement('tabs-container');
    this.statusBadgeEl = this.getElement('connection-status');
    this.infoNameEl = document.getElementById('info-name') as HTMLInputElement;
    this.infoLocationEl = document.getElementById('info-location') as HTMLInputElement;
    this.infoDescriptionEl = document.getElementById('info-description') as HTMLTextAreaElement;
    this.infoSensorTypeEl = document.getElementById('info-sensor-type') as HTMLInputElement;
    this.infoFirmwareEl = document.getElementById('info-firmware') as HTMLInputElement;
    this.saveDeviceInfoBtn = this.getElement('save-device-info');
    this.saveStatusEl = this.getElement('save-status');
  }

  private getElement(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element with id '${id}' not found`);
    return el;
  }

  private attachEventListeners(): void {
    // WebSocket message handler
    const originalCallback = (window as any).onWebSocketMessage;
    (window as any).onWebSocketMessage = (msg: Message) => {
      if (originalCallback) originalCallback(msg);
      this.addMessage(msg);
    };

    // Connection status handler
    const originalSetStatus = (window as any).setWebSocketStatus;
    (window as any).setWebSocketStatus = (status: string) => {
      if (originalSetStatus) originalSetStatus(status);
      this.updateConnectionStatus(status);
    };

    // Dark mode toggle
    const darkModeBtn = document.getElementById('dark-mode-toggle');
    if (darkModeBtn) {
      darkModeBtn.addEventListener('click', () => this.toggleDarkMode());
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // Modal close handler
    const modal = document.getElementById('message-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    }

    // Save device info button
    this.saveDeviceInfoBtn.addEventListener('click', () => this.saveDeviceInfo());
  }

  private toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', String(this.darkMode));
    this.applyDarkMode();
  }

  private applyDarkMode(): void {
    const html = document.documentElement;
    html.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');

    if (this.selectedDeviceId) {
      this.updateCharts(this.selectedDeviceId);
    }
  }

  private updateConnectionStatus(status: string): void {
    if (status === 'connected') {
      this.statusBadgeEl.textContent = 'Connected';
      this.statusBadgeEl.className = 'status-badge connected';
    } else {
      this.statusBadgeEl.textContent = 'Disconnected';
      this.statusBadgeEl.className = 'status-badge disconnected';
    }
  }

  private addMessage(msg: Message): void {
    try {
      const deviceId = msg.data?.deviceId || (msg as any).topic?.split('/')[0] || 'unknown';

      if (!this.devices.has(deviceId)) {
        this.devices.set(deviceId, {
          messages: [],
          timestamps: [],
          temperatures: [],
          humidities: [],
          pressures: [],
          count: 0,
        });
        this.renderDeviceList();
      }

      const device = this.devices.get(deviceId)!;
      device.messages.unshift(msg);
      device.count += 1;

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

      if (this.selectedDeviceId === deviceId) {
        this.updateDeviceDisplay(deviceId);
      }

      this.renderRawMessages();
    } catch (e) {
      console.error('Error processing message:', e);
    }
  }

  private parseSensorData(msg: Message): SensorData {
    let temperature: number | null = msg.temperature ?? null;
    let humidity: number | null = msg.humidity ?? null;
    let pressure: number | null = msg.pressure ?? null;

    // Fallback: parse from message JSON
    if (temperature === null || humidity === null || pressure === null) {
      try {
        let payload = msg.message || (msg as any).data?.message || '{}';

        if (typeof payload === 'string') {
          payload = JSON.parse(payload);
        }

        if (temperature === null && payload.temperature !== undefined) {
          temperature = parseFloat(payload.temperature);
        }
        if (humidity === null && payload.humidity !== undefined) {
          humidity = parseFloat(payload.humidity);
        }
        if (pressure === null && payload.pressure !== undefined) {
          pressure = parseFloat(payload.pressure);
        }
      } catch (e) {
        console.warn('Could not parse sensor data:', e);
      }
    }

    return { temperature, humidity, pressure };
  }

  private renderDeviceList(): void {
    this.deviceListEl.innerHTML = '';

    const sortedDevices = Array.from(this.devices.entries()).sort((a, b) => {
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

      const count = data.count > 0 ? `(${data.count})` : '(waiting...)';
      item.textContent = `${deviceId} ${count}`;
      item.addEventListener('click', () => this.selectDevice(deviceId));
      this.deviceListEl.appendChild(item);
    });
  }

  private async selectDevice(deviceId: string): Promise<void> {
    this.selectedDeviceId = deviceId;
    this.renderDeviceList();

    if (this.queryApiEndpoint) {
      await this.loadHistoricalData(deviceId);
      await this.loadDeviceMetadata(deviceId);
    }

    this.updateDeviceDisplay(deviceId);
  }

  private async loadHistoricalData(deviceId: string): Promise<void> {
    try {
      const url = `${this.queryApiEndpoint}/messages?deviceId=${encodeURIComponent(deviceId)}&limit=100`;
      const res = await fetch(url);

      if (res.ok) {
        let data: APIResponse = await res.json();

        if (typeof data.body === 'string') {
          data = JSON.parse(data.body);
        }

        const device = this.devices.get(deviceId);
        if (device && (data as any).messages) {
          ((data as any).messages as Message[]).forEach((msg) => {
            const exists = device.messages.some((m) => m.id === msg.id);
            if (!exists) {
              device.messages.push(msg);
              const ts = new Date(msg.timestamp || Date.now());
              device.timestamps.push(ts);

              const sensorData = this.parseSensorData(msg);
              device.temperatures.push(sensorData.temperature);
              device.humidities.push(sensorData.humidity);
              device.pressures.push(sensorData.pressure);
            }
          });

          device.messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          device.timestamps.sort((a, b) => b.getTime() - a.getTime());

          // Limit data
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

  private async loadDeviceMetadata(deviceId: string): Promise<void> {
    try {
      const url = `${this.queryApiEndpoint}/device-metadata?deviceId=${encodeURIComponent(deviceId)}`;
      const res = await fetch(url);

      if (res.ok) {
        const metadata: DeviceMetadata = await res.json();
        this.deviceMetadata.set(deviceId, metadata);
        this.displayDeviceMetadata(metadata);
      }
    } catch (e) {
      console.warn(`Could not load device metadata for ${deviceId}:`, e);
    }
  }

  private displayDeviceMetadata(metadata: DeviceMetadata): void {
    this.infoNameEl.value = metadata.name || '';
    this.infoLocationEl.value = metadata.location || '';
    this.infoDescriptionEl.value = metadata.description || '';
    this.infoSensorTypeEl.value = metadata.sensorType || '';
    this.infoFirmwareEl.value = metadata.firmwareVersion || '';
  }

  private async saveDeviceInfo(): Promise<void> {
    if (!this.selectedDeviceId) return;

    const metadata: DeviceMetadata = {
      deviceId: this.selectedDeviceId,
      name: this.infoNameEl.value,
      location: this.infoLocationEl.value,
      description: this.infoDescriptionEl.value,
      sensorType: this.infoSensorTypeEl.value,
      firmwareVersion: this.infoFirmwareEl.value,
    };

    try {
      const res = await fetch(`${this.queryApiEndpoint}/device-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });

      if (res.ok) {
        this.deviceMetadata.set(this.selectedDeviceId, metadata);
        this.saveStatusEl.textContent = '✓ Saved successfully';
        this.saveStatusEl.className = 'success';
        setTimeout(() => {
          this.saveStatusEl.textContent = '';
          this.saveStatusEl.className = '';
        }, 3000);
      } else {
        this.saveStatusEl.textContent = '✗ Save failed';
        this.saveStatusEl.className = 'error';
      }
    } catch (e) {
      console.error('Error saving device info:', e);
      this.saveStatusEl.textContent = '✗ Error saving';
      this.saveStatusEl.className = 'error';
    }
  }

  private updateDeviceDisplay(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    this.deviceHeaderEl.innerHTML = `<h2>📱 Device: <code>${escapeHtml(deviceId)}</code></h2>`;

    let dateRange = '--';
    if (device.timestamps.length > 0) {
      const oldest = device.timestamps[device.timestamps.length - 1];
      const newest = device.timestamps[0];
      dateRange = `${oldest.toLocaleString()} → ${newest.toLocaleString()}`;
    }

    const lastUpdate = device.timestamps[0] ? device.timestamps[0].toLocaleTimeString() : '--';

    const metricCount = document.getElementById('metric-count');
    const metricRange = document.getElementById('metric-date-range');
    const metricUpdate = document.getElementById('metric-last-update');

    if (metricCount) metricCount.textContent = String(device.count);
    if (metricRange) metricRange.textContent = dateRange;
    if (metricUpdate) metricUpdate.textContent = lastUpdate;

    this.deviceMetricsEl.style.display = 'grid';
    this.tabsContainerEl.style.display = 'block';

    this.updateCharts(deviceId);
  }

  private updateCharts(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    const labels = device.timestamps.map((ts) => ts.toLocaleTimeString());

    this.updateChart('temperature', labels, device.temperatures, '🌡️ Temperature (°F)', '#e74c3c');
    this.updateChart('humidity', labels, device.humidities, '💧 Humidity (%)', '#3498db');
    this.updateChart('pressure', labels, device.pressures, '🔵 Pressure (hPa)', '#f39c12');
  }

  private updateChart(
    type: string,
    labels: string[],
    data: (number | null)[],
    label: string,
    color: string
  ): void {
    const canvas = document.getElementById(`${type}-chart`) as HTMLCanvasElement;
    if (!canvas) return;

    // Set canvas dimensions based on data points for horizontal scrolling
    const minWidthPerPoint = 60; // pixels per data point
    const rightPadding = 100; // padding at end
    const canvasWidth = Math.max(600, labels.length * minWidthPerPoint + rightPadding);
    canvas.width = canvasWidth;
    canvas.height = 500;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.charts[type]) {
      this.charts[type].destroy();
    }

    this.charts[type] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
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
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const elementIndex = elements[0].index;
            const device = this.devices.get(this.selectedDeviceId!);
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
              color: this.darkMode ? '#f1f5f9' : '#1a202c',
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: label },
            ticks: { color: this.darkMode ? '#cbd5e1' : '#6b7280' },
            grid: {
              color: this.darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(200, 200, 200, 0.1)',
            },
          },
          x: {
            title: { display: true, text: 'Time' },
            ticks: { color: this.darkMode ? '#cbd5e1' : '#6b7280' },
            grid: {
              color: this.darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(200, 200, 200, 0.1)',
            },
          },
        },
      },
    });
  }

  private showRawMessage(message: Message): void {
    const modal = document.getElementById('message-modal');
    const content = document.getElementById('message-content');
    if (modal && content) {
      content.textContent = JSON.stringify(message, null, 2);
      modal.style.display = 'flex';
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private switchTab(tabName: string): void {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    document.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`)?.classList.add('active');

    setTimeout(() => {
      if (this.charts[tabName]) {
        this.charts[tabName].resize();
      }
    }, 0);
  }

  private renderRawMessages(): void {
    this.messagesEl.innerHTML = '';

    const allMessages: Message[] = [];
    this.devices.forEach((device) => {
      device.messages.forEach((msg) => {
        allMessages.push(msg);
      });
    });
    allMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    allMessages.slice(0, 20).forEach((msg) => {
      const item = document.createElement('div');
      item.className = 'message-item';
      item.textContent = JSON.stringify(msg, null, 2);
      this.messagesEl.appendChild(item);
    });
  }

  private updateDeviceCount(): void {
    this.deviceCountEl.textContent = String(this.devices.size);
  }

  private updateLastUpdate(): void {
    this.lastUpdateEl.textContent = new Date().toLocaleTimeString();
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  (window as any).dashboard = new DeviceDashboard();
});
