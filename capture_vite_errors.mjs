import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/', 'vite-hmr');

ws.on('open', () => {
  console.log('Connected to Vite HMR WebSocket');
  // Keep listening for 5 seconds
  setTimeout(() => {
    ws.close();
    console.log('Finished listening');
  }, 5000);
});

ws.on('message', (data) => {
  const payload = JSON.parse(data);
  if (payload.type === 'error') {
    console.error('VITE ERROR:', payload.err);
  } else {
    console.log('Vite msg:', payload.type);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});
