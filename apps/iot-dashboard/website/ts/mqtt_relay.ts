// WebSocket MQTT Relay Client with Dashboard Integration

interface WebSocketMessage {
  [key: string]: any;
  timestamp?: number;
}

interface Config {
  websocketUrl?: string;
  [key: string]: any;
}

interface WindowWithCallbacks extends Window {
  onWebSocketMessage: ((msg: WebSocketMessage) => void) | null;
  setWebSocketStatus: ((status: string) => void) | null;
}

let socket: WebSocket | null = null;

// Callback functions that can be overridden by dashboard
(window as any).onWebSocketMessage = null;
(window as any).setWebSocketStatus = null;

async function startWebSocket(): Promise<void> {
  let cfg: Config = { websocketUrl: undefined };

  try {
    const res = await fetch('/config.json');
    if (res.ok) {
      cfg = await res.json();
    }
  } catch (e) {
    console.warn('No config.json found, please add websocketUrl');
  }

  const url = cfg.websocketUrl || prompt('WebSocket URL (wss://...):');
  if (!url) {
    return;
  }

  socket = new WebSocket(url);

  socket.onopen = (): void => {
    console.log('WebSocket connected');
    setConnectionStatus('connected');
  };

  socket.onmessage = (ev: MessageEvent): void => {
    try {
      const msg: WebSocketMessage = JSON.parse(ev.data as string);

      // Add timestamp if not present
      if (!msg.timestamp) {
        msg.timestamp = Date.now();
      }

      // Call callback if dashboard is loaded
      if ((window as any).onWebSocketMessage) {
        ((window as any).onWebSocketMessage)(msg);
      }
    } catch (e) {
      console.error('Failed to parse message:', ev.data, e);
    }
  };

  socket.onclose = (): void => {
    console.log('WebSocket closed');
    setConnectionStatus('disconnected');
  };

  socket.onerror = (e: Event): void => {
    console.error('WebSocket error', e);
    setConnectionStatus('error');
  };
}

function setConnectionStatus(status: string): void {
  if ((window as any).setWebSocketStatus) {
    ((window as any).setWebSocketStatus)(status);
  }
}

document.addEventListener('DOMContentLoaded', (): void => {
  const btn = document.getElementById('ws-start');
  if (btn) {
    btn.addEventListener('click', startWebSocket);
  }
});
