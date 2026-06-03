const http = require('http');
const WebSocket = require('ws');

// Globale Highscores (im Speicher - reset bei Server-Neustart)
// Für persistenz müsste man eine DB nutzen
let globalScores = [];

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
  // GET /scores → Top 10 zurückgeben
  if(req.url === '/scores') {
    res.end(JSON.stringify(globalScores.slice(0,10)));
  } else {
    res.end(JSON.stringify({status:'ok'}));
  }
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
  ws.isReady = false;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch(e) { return; }
    switch(msg.type) {

      case 'submit_score': {
        // Score einreichen
        const name = (msg.name || 'Anonym').substring(0, 12);
        const score = parseInt(msg.score) || 0;
        if(score > 0) {
          globalScores.push({ name, score, date: new Date().toLocaleDateString('de') });
          globalScores.sort((a,b) => b.score - a.score);
          globalScores = globalScores.slice(0, 50); // Max 50 Einträge
        }
        ws.send(JSON.stringify({ type: 'scores', scores: globalScores.slice(0,10) }));
        break;
      }

      case 'get_scores': {
        ws.send(JSON.stringify({ type: 'scores', scores: globalScores.slice(0,10) }));
        break;
      }

      case 'create': {
        const code = generateCode();
        ws.profile = { name: msg.name || 'Spieler 1', avatar: msg.avatar || null };
        rooms[code] = { players: [ws, null], seed: generateSeed(), readyCount: 0 };
        ws.roomCode = code; ws.playerIndex = 0; ws.isReady = false;
        ws.send(JSON.stringify({ type: 'created', code, playerIndex: 0 }));
        break;
      }
      case 'join': {
        const code = msg.code.toUpperCase();
        const room = rooms[code];
        if (!room) { ws.send(JSON.stringify({ type: 'error', msg: 'Raum nicht gefunden!' })); return; }
        if (room.players[1]) { ws.send(JSON.stringify({ type: 'error', msg: 'Raum ist voll!' })); return; }
        ws.profile = { name: msg.name || 'Spieler 2', avatar: msg.avatar || null };
        room.players[1] = ws; ws.roomCode = code; ws.playerIndex = 1; ws.isReady = false;
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
      case 'ready': {
        const room = rooms[ws.roomCode]; if (!room) return;
        ws.isReady = true;
        const allReady = room.players.every(p => p && p.isReady);
        if(allReady) {
          room.seed = generateSeed();
          room.players.forEach(p => { if(p) p.isReady = false; });
          broadcast(room, { type: 'restart', seed: room.seed });
        } else {
          broadcastExcept(room, { type: 'opponent_ready' }, ws);
        }
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
