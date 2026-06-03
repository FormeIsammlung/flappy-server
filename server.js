const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Flappy Face Multiplayer Server läuft!');
});

const wss = new WebSocket.Server({ server });
const rooms = {};

function generateCode() { return Math.random().toString(36).substring(2, 7).toUpperCase(); }
function generateSeed() { return Math.floor(Math.random() * 1000000); }
function broadcast(room, data) {
  room.players.forEach(p => { if(p && p.readyState === WebSocket.OPEN) p.send(JSON.stringify(data)); });
}
function broadcastExcept(room, data, excludeWs) {
  room.players.forEach(p => { if(p && p !== excludeWs && p.readyState === WebSocket.OPEN) p.send(JSON.stringify(data)); });
}

wss.on('connection', (ws) => {
  ws.roomCode = null; ws.playerIndex = -1;
  ws.profile = { name: 'Spieler', avatar: null };

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch(e) { return; }
    switch(msg.type) {
      case 'create': {
        const code = generateCode();
        ws.profile = { name: msg.name || 'Spieler 1', avatar: msg.avatar || null };
        rooms[code] = { players: [ws, null], seed: generateSeed() };
        ws.roomCode = code; ws.playerIndex = 0;
        ws.send(JSON.stringify({ type: 'created', code, playerIndex: 0 }));
        break;
      }
      case 'join': {
        const code = msg.code.toUpperCase();
        const room = rooms[code];
        if (!room) { ws.send(JSON.stringify({ type: 'error', msg: 'Raum nicht gefunden!' })); return; }
        if (room.players[1]) { ws.send(JSON.stringify({ type: 'error', msg: 'Raum ist voll!' })); return; }
        ws.profile = { name: msg.name || 'Spieler 2', avatar: msg.avatar || null };
        room.players[1] = ws; ws.roomCode = code; ws.playerIndex = 1;
        ws.send(JSON.stringify({ type: 'joined', code, playerIndex: 1, oppName: room.players[0].profile.name, oppAvatar: room.players[0].profile.avatar }));
        room.players[0].send(JSON.stringify({ type: 'opponent_profile', name: ws.profile.name, avatar: ws.profile.avatar }));
        broadcast(room, { type: 'start', seed: room.seed });
        break;
      }
      case 'update': {
        const room = rooms[ws.roomCode]; if (!room) return;
        broadcastExcept(room, { type:'update', playerIndex:ws.playerIndex, y:msg.y, vy:msg.vy, score:msg.score, alive:msg.alive }, ws);
        break;
      }
      case 'dead': {
        const room = rooms[ws.roomCode]; if (!room) return;
        broadcastExcept(room, { type:'dead', playerIndex:ws.playerIndex, score:msg.score }, ws);
        break;
      }
      case 'restart': {
        const room = rooms[ws.roomCode]; if (!room) return;
        room.seed = generateSeed();
        broadcast(room, { type:'restart', seed:room.seed });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms[ws.roomCode]; if (!room) return;
    broadcastExcept(room, { type:'opponent_left' }, ws);
    delete rooms[ws.roomCode];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server läuft auf Port ' + PORT));
