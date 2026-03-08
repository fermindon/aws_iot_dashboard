import Chart from 'chart.js/auto';

// ── Type Definitions ───────────────────────────────────────────────────────

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

// ── IoT Device Dashboard ───────────────────────────────────────────────────

class DeviceDashboard {
  private devices: Map<string, DeviceData>;
  private deviceMetadata: Map<string, DeviceMetadata>;
  private selectedDeviceId: string | null;
  private charts: ChartInstance;
  private maxDataPoints: number;
  private queryApiEndpoint: string | null;
  private darkMode: boolean;

  // DOM refs
  private deviceListEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private deviceCountEl!: HTMLElement;
  private lastUpdateEl!: HTMLElement;
  private deviceHeaderEl!: HTMLElement;
  private deviceMetricsEl!: HTMLElement;
  private deviceContentEl!: HTMLElement;
  private emptyStateEl!: HTMLElement;
  private statusIndicatorEl!: HTMLElement;
  private rawMsgCountEl!: HTMLElement;

  // Info form refs
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

  // ── Initialization ─────────────────────────────────────────────────────

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

        let devices = data;
        if (typeof data.body === 'string') {
          devices = JSON.parse(data.body);
        }

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
    this.deviceContentEl = this.getElement('device-content');
    this.emptyStateEl = this.getElement('empty-state');
    this.statusIndicatorEl = this.getElement('connection-status');
    this.rawMsgCountEl = this.getElement('raw-msg-count');
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
        const target = (e.currentTarget as HTMLElement);
        const tab = target.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // Modal close handler
    const modal = document.getElementById('message-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    // Save device info button
    this.saveDeviceInfoBtn.addEventListener('click', () => this.saveDeviceInfo());
  }

  // ── Theme ──────────────────────────────────────────────────────────────

  private toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', String(this.darkMode));
    this.applyDarkMode();
  }

  private applyDarkMode(): void {
    document.documentElement.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
    if (this.selectedDeviceId) {
      this.updateCharts(this.selectedDeviceId);
    }
  }

  // ── Connection Status ──────────────────────────────────────────────────

  private updateConnectionStatus(status: string): void {
    const textEl = this.statusIndicatorEl.querySelector('.status-text');
    if (status === 'connected') {
      this.statusIndicatorEl.className = 'status-indicator connected';
      if (textEl) textEl.textContent = 'Connected';
    } else {
      this.statusIndicatorEl.className = 'status-indicator disconnected';
      if (textEl) textEl.textContent = 'Disconnected';
    }
  }

  // ── Message Handling ───────────────────────────────────────────────────

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
        // Silently skip parse errors
      }
    }

    return { temperature, humidity, pressure };
  }

  // ── Device List ────────────────────────────────────────────────────────

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
      if (this.selectedDeviceId === deviceId) item.classList.add('active');
      if (data.count > 0) item.classList.add('has-data');

      const dot = document.createElement('span');
      dot.className = 'device-item-dot';

      const name = document.createElement('span');
      name.className = 'device-item-name';
      // Use friendly name from metadata if available
      const meta = this.deviceMetadata.get(deviceId);
      name.textContent = meta?.name || deviceId;
      name.title = deviceId; // always show device ID on hover

      const count = document.createElement('span');
      count.className = 'device-item-count';
      count.textContent = data.count > 0 ? String(data.count) : '—';

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(count);
      item.addEventListener('click', () => this.selectDevice(deviceId));
      this.deviceListEl.appendChild(item);
    });
  }

  // ── Device Selection ───────────────────────────────────────────────────

  private async selectDevice(deviceId: string): Promise<void> {
    this.selectedDeviceId = deviceId;
    this.renderDeviceList();
    this.clearDeviceInfo();

    // Show content, hide empty state
    this.emptyStateEl.style.display = 'none';
    this.deviceContentEl.style.display = 'block';

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

  // ── Device Metadata ────────────────────────────────────────────────────

  private async loadDeviceMetadata(deviceId: string): Promise<void> {
    try {
      const url = `${this.queryApiEndpoint}/device-metadata?deviceId=${encodeURIComponent(deviceId)}`;
      const res = await fetch(url);

      if (res.ok) {
        const metadata: DeviceMetadata = await res.json();
        this.deviceMetadata.set(deviceId, metadata);
        this.displayDeviceMetadata(metadata);
        // Re-render device list to show friendly names
        this.renderDeviceList();
      }
    } catch (e) {
      console.warn(`Could not load device metadata for ${deviceId}:`, e);
    }
  }

  private clearDeviceInfo(): void {
    this.infoNameEl.value = '';
    this.infoLocationEl.value = '';
    this.infoDescriptionEl.value = '';
    this.infoSensorTypeEl.value = '';
    this.infoFirmwareEl.value = '';
    this.saveStatusEl.textContent = '';
    this.saveStatusEl.className = 'save-status';
  }

  private displayDeviceMetadata(metadata: DeviceMetadata): void {
    this.infoNameEl.value = metadata.name || '';
    this.infoLocationEl.value = metadata.location || '';
    this.infoDescriptionEl.value = metadata.description || '';
    this.infoSensorTypeEl.value = metadata.sensorType || '';
    this.infoFirmwareEl.value = metadata.firmwareVersion || '';
  }

  private async saveDeviceInfo(): Promise<void> {
    if (!this.selectedDeviceId) {
      this.showSaveStatus('No device selected', false);
      return;
    }

    if (!this.queryApiEndpoint) {
      this.showSaveStatus('API endpoint not configured', false);
      return;
    }

    const metadata: DeviceMetadata = {
      deviceId: this.selectedDeviceId,
      name: this.infoNameEl.value,
      location: this.infoLocationEl.value,
      description: this.infoDescriptionEl.value,
      sensorType: this.infoSensorTypeEl.value,
      firmwareVersion: this.infoFirmwareEl.value,
    };

    try {
      const url = `${this.queryApiEndpoint}/device-metadata`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });

      if (res.ok) {
        this.deviceMetadata.set(this.selectedDeviceId, metadata);
        this.showSaveStatus('Saved successfully', true);
        this.renderDeviceList(); // Update friendly names
      } else {
        const responseText = await res.text();
        const error = responseText ? JSON.parse(responseText).error : 'Unknown error';
        this.showSaveStatus(`Save failed: ${error}`, false);
      }
    } catch (e) {
      console.error('Error saving device info:', e);
      this.showSaveStatus('Network error', false);
    }
  }

  private showSaveStatus(message: string, success: boolean): void {
    this.saveStatusEl.textContent = success ? `✓ ${message}` : `✗ ${message}`;
    this.saveStatusEl.className = `save-status ${success ? 'success' : 'error'}`;
    if (success) {
      setTimeout(() => {
        this.saveStatusEl.textContent = '';
        this.saveStatusEl.className = 'save-status';
      }, 3000);
    }
  }

  // ── Device Display ─────────────────────────────────────────────────────

  private updateDeviceDisplay(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Header with device ID badge
    const meta = this.deviceMetadata.get(deviceId);
    const displayName = meta?.name || deviceId;
    this.deviceHeaderEl.innerHTML = `
      <h2>${escapeHtml(displayName)} <span class="device-id-badge">${escapeHtml(deviceId)}</span></h2>
    `;

    // Date range
    let dateRange = '--';
    if (device.timestamps.length > 0) {
      const oldest = device.timestamps[device.timestamps.length - 1];
      const newest = device.timestamps[0];
      dateRange = `${oldest.toLocaleDateString()} — ${newest.toLocaleDateString()}`;
    }

    // Last update
    const lastUpdate = device.timestamps[0] ? device.timestamps[0].toLocaleTimeString() : '--';

    // Average temperature
    const validTemps = device.temperatures.filter((t): t is number => t !== null);
    const avgTemp = validTemps.length > 0
      ? (validTemps.reduce((a, b) => a + b, 0) / validTemps.length).toFixed(1) + '°F'
      : '--';

    // Update metric cards
    const metricCount = document.getElementById('metric-count');
    const metricRange = document.getElementById('metric-date-range');
    const metricUpdate = document.getElementById('metric-last-update');
    const metricAvgTemp = document.getElementById('metric-avg-temp');

    if (metricCount) metricCount.textContent = String(device.count);
    if (metricRange) metricRange.textContent = dateRange;
    if (metricUpdate) metricUpdate.textContent = lastUpdate;
    if (metricAvgTemp) metricAvgTemp.textContent = avgTemp;

    this.updateCharts(deviceId);
    this.renderRawMessages();
  }

  // ── Charts ─────────────────────────────────────────────────────────────

  private updateCharts(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    const labels = device.timestamps.map((ts) => ts.toLocaleTimeString());
    const isDark = this.darkMode;

    this.renderChart('temperature', labels, device.temperatures, 'Temperature (°F)', '#ef4444', isDark);
    this.renderChart('humidity', labels, device.humidities, 'Humidity (%)', '#3b82f6', isDark);
    this.renderChart('pressure', labels, device.pressures, 'Pressure (hPa)', '#f59e0b', isDark);
  }

  private renderChart(
    type: string,
    labels: string[],
    data: (number | null)[],
    label: string,
    color: string,
    isDark: boolean
  ): void {
    const canvas = document.getElementById(`${type}-chart`) as HTMLCanvasElement;
    if (!canvas) return;

    const minWidthPerPoint = 60;
    const rightPadding = 100;
    const canvasWidth = Math.max(600, labels.length * minWidthPerPoint + rightPadding);
    canvas.width = canvasWidth;
    canvas.height = 380;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.charts[type]) {
      this.charts[type].destroy();
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 380);
    gradient.addColorStop(0, this.hexToRgba(color, 0.15));
    gradient.addColorStop(1, this.hexToRgba(color, 0.01));

    const textColor = isDark ? '#94a3b8' : '#6b7280';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    this.charts[type] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            borderColor: color,
            backgroundColor: gradient,
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: color,
            pointBorderColor: isDark ? '#111827' : '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
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
            display: false,
          },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            titleColor: isDark ? '#f1f5f9' : '#111827',
            bodyColor: isDark ? '#94a3b8' : '#6b7280',
            borderColor: isDark ? '#334155' : '#e5e7eb',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            titleFont: { weight: 'bold' as const, size: 13 },
            bodyFont: { size: 12 },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              color: textColor,
              font: { size: 11 },
              padding: 8,
            },
            grid: {
              color: gridColor,
            },
            border: { display: false },
          },
          x: {
            ticks: {
              color: textColor,
              font: { size: 11 },
              maxRotation: 45,
              padding: 8,
            },
            grid: {
              color: gridColor,
            },
            border: { display: false },
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

  // ── Tabs ───────────────────────────────────────────────────────────────

  private switchTab(tabName: string): void {
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    document.querySelectorAll('.tab-content').forEach((content) => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`)?.classList.add('active');

    // Resize chart on tab switch
    setTimeout(() => {
      if (this.charts[tabName]) {
        this.charts[tabName].resize();
      }
    }, 0);
  }

  // ── Raw Messages ───────────────────────────────────────────────────────

  private renderRawMessages(): void {
    if (!this.selectedDeviceId) return;
    const device = this.devices.get(this.selectedDeviceId);
    if (!device) return;

    this.messagesEl.innerHTML = '';

    const messages = device.messages.slice(0, 30);
    this.rawMsgCountEl.textContent = `${messages.length} of ${device.messages.length} messages`;

    messages.forEach((msg) => {
      const item = document.createElement('div');
      item.className = 'message-item';

      const header = document.createElement('div');
      header.className = 'message-item-header';

      const deviceLabel = document.createElement('span');
      deviceLabel.className = 'message-item-device';
      deviceLabel.textContent = msg.deviceId || this.selectedDeviceId || 'unknown';

      const time = document.createElement('span');
      time.className = 'message-item-time';
      time.textContent = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'now';

      header.appendChild(deviceLabel);
      header.appendChild(time);

      const body = document.createElement('div');
      body.className = 'message-item-body';

      const sensorData = this.parseSensorData(msg);
      const parts: string[] = [];
      if (sensorData.temperature !== null) parts.push(`temp: ${sensorData.temperature}°F`);
      if (sensorData.humidity !== null) parts.push(`humidity: ${sensorData.humidity}%`);
      if (sensorData.pressure !== null) parts.push(`pressure: ${sensorData.pressure} hPa`);
      body.textContent = parts.length > 0 ? parts.join('  ·  ') : JSON.stringify(msg, null, 2);

      item.appendChild(header);
      item.appendChild(body);
      item.addEventListener('click', () => this.showRawMessage(msg));
      this.messagesEl.appendChild(item);
    });
  }

  // ── Utility ────────────────────────────────────────────────────────────

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
