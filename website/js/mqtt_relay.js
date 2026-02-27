// WebSocket MQTT Relay Client with Dashboard Integration
let socket;

// Callback functions that can be overridden by dashboard
window.onWebSocketMessage = null;
window.setWebSocketStatus = null;

async function startWebSocket() {
  let cfg = { websocketUrl: null };
  try {
    const res = await fetch('/config.json');
    if (res.ok) cfg = await res.json();
  } catch (e) { console.warn('No config.json found, please add websocketUrl'); }

  const url = cfg.websocketUrl || prompt('WebSocket URL (wss://...):');
  if (!url) return;

  socket = new WebSocket(url);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
    setConnectionStatus('connected');
  };
  
  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      // Add timestamp if not present
      if (!msg.timestamp) {
        msg.timestamp = Date.now();
      }
      
      // Call callback if dashboard is loaded
      if (window.onWebSocketMessage) {
        window.onWebSocketMessage(msg);
      }
    } catch (e) {
      console.error('Failed to parse message:', ev.data, e);
    }
  };
  
  socket.onclose = () => {
    console.log('WebSocket closed');
    setConnectionStatus('disconnected');
  };
  
  socket.onerror = (e) => {
    console.error('WebSocket error', e);
    setConnectionStatus('error');
  };
}

function setConnectionStatus(status) {
  if (window.setWebSocketStatus) {
    window.setWebSocketStatus(status);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('ws-start');
  if (btn) btn.addEventListener('click', startWebSocket);
});
