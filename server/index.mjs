import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: false } });

const states = new Map();

io.on('connection', socket => {
  socket.emit('roster', [...states.entries()].map(([id, state]) => ({ id, ...state })));
  io.emit('population', io.engine.clientsCount);

  socket.on('state', state => {
    if (!state || !Number.isFinite(state.lat) || !Number.isFinite(state.lon)) return;
    const clean = {
      siteId: String(state.siteId || ''),
      lat: +state.lat,
      lon: +state.lon,
      elevation: Number.isFinite(state.elevation) ? +state.elevation : 0,
      heading: Number.isFinite(state.heading) ? +state.heading : 0,
      speed: Number.isFinite(state.speed) ? +state.speed : 0,
      steering: Number.isFinite(state.steering) ? Math.max(-1, Math.min(1, +state.steering)) : 0,
      wheelSpin: Number.isFinite(state.wheelSpin) ? +state.wheelSpin : 0,
      suspension: Array.isArray(state.suspension)
        ? state.suspension.slice(0, 6).map(v => Number.isFinite(v) ? Math.max(-1, Math.min(1, +v)) : 0)
        : [0,0,0,0,0,0]
    };
    states.set(socket.id, clean);
    socket.broadcast.emit('peer-state', { id: socket.id, ...clean });
  });

  socket.on('disconnect', () => {
    states.delete(socket.id);
    socket.broadcast.emit('peer-left', socket.id);
    io.emit('population', io.engine.clientsCount);
  });
});

app.use(express.static(path.join(root, 'dist'), {
  maxAge: '1h',
  setHeaders(res, file) {
    if (file.endsWith('.bin')) res.setHeader('Cache-Control', 'public,max-age=31536000,immutable');
  }
}));
app.use((req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Lunar rover server on http://localhost:${port}`));
