const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Flappy Face Multiplayer Server lÃ¤uft!');
});

const wss = new WebSocket.Server({ server });

// RÃ¤ume: { roomCode: { players: [ws1, ws2], scores: [0,0] } }
const rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function broadcast(room, data, excludeWs = null) {
  room.players.forEach((player, i) => {
    if (player && player !== excludeWs && player.readyState === WebSocket.OPEN) {
      player.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.playerIndex = -1;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    switch(msg.type) {

      case 'create': {
        const code = generateCode();
        rooms[code] = { players: [ws, null], scores: [0, 0], state: 'waiting' };
        ws.roomCode = code;
        ws.playerIndex = 0;
        ws.send(JSON.stringify({ type: 'created', code, playerIndex: 0 }));
        break;
      }

      case 'join': {
        const code = msg.code.toUpperCase();
        const room = rooms[code];
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', msg: 'Raum nicht gefunden!' }));
          return;
        }
        if (room.players[1]) {
          ws.send(JSON.stringify({ type: 'error', msg: 'Raum ist voll!' }));
          return;
        }
        room.players[1] = ws;
        ws.roomCode = code;
        ws.playerIndex = 1;
        ws.send(JSON.stringify({ type: 'joined', code, playerIndex: 1 }));
        // Beide Spieler informieren dass es losgeht
        broadcast(room, { type: 'start' });
        break;
      }

      case 'update': {
        // Spieler sendet seine Position
        const room = rooms[ws.roomCode];
        if (!room) return;
        broadcast(room, {
          type: 'update',
          playerIndex: ws.playerIndex,
          y: msg.y,
          vy: msg.vy,
          score: msg.score,
          alive: msg.alive
        }, ws);
        break;
      }

      case 'dead': {
        const room = rooms[ws.roomCode];
        if (!room) return;
        broadcast(room, {
          type: 'dead',
          playerIndex: ws.playerIndex,
          score: msg.score
        }, ws);
        break;
      }

      case 'restart': {
        const room = rooms[ws.roomCode];
        if (!room) return;
        broadcast(room, { type: 'restart', playerIndex: ws.playerIndex }, ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms[ws.roomCode];
    if (!room) return;
    broadcast(room, { type: 'opponent_left' });
    delete rooms[ws.roomCode];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server lÃ¤uft auf Port ' + PORT);
});
