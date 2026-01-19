import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

// Room management structure
type Room = {
  [roomId: string]: Set<WebSocket>;
};

const rooms: Room = {};

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  let currentRoom: string | null = null;

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'join': {
          const { roomId } = data;
          currentRoom = roomId;
          if (!rooms[roomId]) rooms[roomId] = new Set();
          rooms[roomId].add(ws);
          // Notify others
          rooms[roomId].forEach(client => {
            if (client !== ws) client.send(JSON.stringify({ type: 'peer-joined' }));
          });
          break;
        }
        case 'signal': {
          const { roomId, signal } = data;
          // Relay signaling data to all peers except sender
          if (rooms[roomId]) {
            rooms[roomId].forEach(client => {
              if (client !== ws) client.send(JSON.stringify({ type: 'signal', signal }));
            });
          }
          break;
        }
        case 'leave': {
          if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom].delete(ws);
            if (rooms[currentRoom].size === 0) delete rooms[currentRoom];
          }
          break;
        }
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].delete(ws);
      if (rooms[currentRoom].size === 0) delete rooms[currentRoom];
    }
  });
});

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 4000;
server.listen(PORT, () => {
  console.log(`[WebRTC Signal] WebSocket signaling server running on port ${PORT}`);
});
