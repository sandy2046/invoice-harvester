/**
 * 发票收割者 - Socket.IO 服务器 (Render 部署版本)
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);

// CORS 配置 - 允许 Vercel 前端访问
const io = new Server(httpServer, {
  cors: {
    origin: ["https://6a054f2412f6191505e79b9b.vercel.app", "http://localhost:3000", "http://localhost:5500"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: ["https://6a054f2412f6191505e79b9b.vercel.app", "http://localhost:3000", "http://localhost:5500"],
  credentials: true
}));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'invoice-harvester-server', uptime: process.uptime() });
});

// ==================== 游戏常量 ====================
const GRID_SIZE = 20;
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 560;
const COLS = CANVAS_WIDTH / GRID_SIZE;
const ROWS = CANVAS_HEIGHT / GRID_SIZE;

const INVOICE_TYPES = [
  { name: '普票', score: 10, color: '#94a3b8' },
  { name: '电子', score: 20, color: '#22c55e' },
  { name: '专票', score: 50, color: '#3b82f6' },
  { name: '增值税', score: 80, color: '#f59e0b' },
  { name: '红字', score: 100, color: '#ef4444' },
  { name: '钻石', score: 200, color: '#a855f7' },
  { name: '黄金', score: 500, color: '#eab308' }
];

// ==================== 房间管理 ====================
class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map();
  }

  createRoom(hostId, hostName, roomName) {
    const roomId = uuidv4().substr(0, 8).toUpperCase();
    const room = {
      id: roomId,
      name: roomName || null,
      hostId: hostId,
      players: new Map(),
      status: 'waiting',
      gameState: null,
      createdAt: Date.now()
    };

    room.players.set(hostId, {
      id: hostId,
      name: hostName,
      isHost: true,
      isReady: false,
      snake: [],
      score: 0,
      isDead: false
    });

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId);

    return room;
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: '房间不存在' };
    if (room.status !== 'waiting') return { success: false, error: '游戏已开始' };
    if (room.players.size >= 2) return { success: false, error: '房间已满' };

    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      isHost: false,
      isReady: false,
      snake: [],
      score: 0,
      isDead: false
    });

    this.playerRooms.set(playerId, roomId);
    return { success: true, room };
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players.delete(playerId);
    this.playerRooms.delete(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { roomId, deleted: true };
    }

    if (room.hostId === playerId && room.players.size > 0) {
      const newHost = room.players.values().next().value;
      room.hostId = newHost.id;
      newHost.isHost = true;
    }

    return { roomId, deleted: false, room };
  }

  getRoomList() {
    const list = [];
    for (const [id, room] of this.rooms) {
      if (room.status === 'waiting') {
        list.push({
          id: id,
          name: room.name,
          hostName: room.players.get(room.hostId)?.name || '未知',
          playerCount: room.players.size,
          status: room.status
        });
      }
    }
    return list;
  }

  getRoomByPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.rooms.get(roomId) : null;
  }
}

const roomManager = new RoomManager();

// ==================== 游戏逻辑 ====================
class GameLogic {
  static initGame(room) {
    const gameState = {
      foods: [],
      startedAt: Date.now(),
      lastUpdate: Date.now()
    };

    for (const [playerId, player] of room.players) {
      player.snake = player.isHost
        ? [{ x: 10, y: 14 }, { x: 9, y: 14 }, { x: 8, y: 14 }]
        : [{ x: 25, y: 14 }, { x: 26, y: 14 }, { x: 27, y: 14 }];
      player.score = 0;
      player.isDead = false;
      player.direction = player.isHost ? 'right' : 'left';
    }

    for (let i = 0; i < 15; i++) {
      gameState.foods.push(this.spawnFood(room));
    }

    room.gameState = gameState;
    room.status = 'playing';
  }

  static spawnFood(room) {
    const typeIdx = Math.floor(Math.random() * INVOICE_TYPES.length);
    const type = INVOICE_TYPES[typeIdx];

    let x, y;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      attempts++;
    } while (this.isPositionOccupied(room, x, y) && attempts < 100);

    return { x, y, ...type, id: uuidv4() };
  }

  static isPositionOccupied(room, x, y) {
    for (const player of room.players.values()) {
      for (const seg of player.snake) {
        if (seg.x === x && seg.y === y) return true;
      }
    }
    return false;
  }

  static updateGame(room) {
    const gameState = room.gameState;
    if (!gameState) return;

    const now = Date.now();
    gameState.lastUpdate = now;

    for (const [playerId, player] of room.players) {
      if (player.isDead) continue;

      const head = { ...player.snake[0] };

      switch (player.direction) {
        case 'up': head.y--; break;
        case 'down': head.y++; break;
        case 'left': head.x--; break;
        case 'right': head.x++; break;
      }

      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        player.isDead = true;
        continue;
      }

      for (const seg of player.snake) {
        if (head.x === seg.x && head.y === seg.y) {
          player.isDead = true;
          break;
        }
      }
      if (player.isDead) continue;

      for (const [otherId, otherPlayer] of room.players) {
        if (otherId === playerId || otherPlayer.isDead) continue;
        for (const seg of otherPlayer.snake) {
          if (head.x === seg.x && head.y === seg.y) {
            player.isDead = true;
            break;
          }
        }
      }
      if (player.isDead) continue;

      player.snake.unshift(head);

      let ate = false;
      for (let i = gameState.foods.length - 1; i >= 0; i--) {
        const food = gameState.foods[i];
        if (head.x === food.x && head.y === food.y) {
          player.score += food.score;
          gameState.foods.splice(i, 1);
          gameState.foods.push(this.spawnFood(room));
          ate = true;
          break;
        }
      }

      if (!ate) {
        player.snake.pop();
      }
    }

    const alivePlayers = Array.from(room.players.values()).filter(p => !p.isDead);
    if (alivePlayers.length <= 1) {
      room.status = 'ended';
      return { ended: true, winner: alivePlayers[0] || null };
    }

    return { ended: false };
  }
}

// ==================== Socket.IO 事件处理 ====================
io.on('connection', (socket) => {
  console.log(`玩家连接: ${socket.id}`);

  socket.on('getRoomList', () => {
    socket.emit('roomList', roomManager.getRoomList());
  });

  socket.on('createRoom', (data) => {
    const { playerName, roomName } = data;
    const room = roomManager.createRoom(socket.id, playerName, roomName);
    socket.join(room.id);
    socket.emit('roomCreated', {
      roomId: room.id,
      roomName: room.name,
      playerId: socket.id,
      isHost: true
    });
    io.emit('roomList', roomManager.getRoomList());
  });

  socket.on('joinRoom', (data) => {
    const { roomId, playerName } = data;
    const result = roomManager.joinRoom(roomId, socket.id, playerName);

    if (result.success) {
      socket.join(roomId);
      socket.emit('roomJoined', {
        roomId,
        playerId: socket.id,
        isHost: false,
        room: {
          id: result.room.id,
          name: result.room.name,
          hostId: result.room.hostId,
          players: Array.from(result.room.players.values())
        }
      });

      socket.to(roomId).emit('playerJoined', {
        player: result.room.players.get(socket.id)
      });

      io.emit('roomList', roomManager.getRoomList());
    } else {
      socket.emit('joinError', { error: result.error });
    }
  });

  socket.on('playerReady', () => {
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (player) {
      player.isReady = !player.isReady;
      io.to(room.id).emit('playerReadyUpdate', {
        playerId: socket.id,
        isReady: player.isReady
      });
    }
  });

  socket.on('startGame', () => {
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return;

    const allReady = Array.from(room.players.values()).every(p => p.isReady || p.isHost);
    if (!allReady) {
      socket.emit('startError', { error: '有玩家未准备' });
      return;
    }

    GameLogic.initGame(room);
    io.to(room.id).emit('gameStarted', {
      gameState: {
        foods: room.gameState.foods,
        players: Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          snake: p.snake,
          score: p.score,
          isDead: p.isDead
        }))
      }
    });

    startGameLoop(room);
  });

  socket.on('playerMove', (data) => {
    const { direction } = data;
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.status !== 'playing') return;

    const player = room.players.get(socket.id);
    if (!player || player.isDead) return;

    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[direction] !== player.direction) {
      player.direction = direction;
    }
  });

  socket.on('leaveRoom', () => {
    handlePlayerLeave(socket);
  });

  socket.on('disconnect', () => {
    console.log(`玩家断开: ${socket.id}`);
    handlePlayerLeave(socket);
  });
});

function handlePlayerLeave(socket) {
  const result = roomManager.leaveRoom(socket.id);
  if (result) {
    socket.leave(result.roomId);

    if (result.deleted) {
      io.emit('roomList', roomManager.getRoomList());
    } else {
      socket.to(result.roomId).emit('playerLeft', { playerId: socket.id });
      if (result.room) {
        socket.to(result.roomId).emit('hostChanged', {
          newHostId: result.room.hostId,
          players: Array.from(result.room.players.values())
        });
      }
      io.emit('roomList', roomManager.getRoomList());
    }
  }
}

// 游戏循环
const gameLoops = new Map();

function startGameLoop(room) {
  if (gameLoops.has(room.id)) {
    clearInterval(gameLoops.get(room.id));
  }

  const loop = setInterval(() => {
    const result = GameLogic.updateGame(room);

    io.to(room.id).emit('gameUpdate', {
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        snake: p.snake,
        score: p.score,
        isDead: p.isDead,
        direction: p.direction
      })),
      foods: room.gameState.foods
    });

    if (result.ended) {
      clearInterval(loop);
      gameLoops.delete(room.id);
      io.to(room.id).emit('gameEnded', {
        winner: result.winner ? {
          id: result.winner.id,
          name: result.winner.name,
          score: result.winner.score
        } : null,
        players: Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          score: p.score
        }))
      });
    }
  }, 1000 / 10);

  gameLoops.set(room.id, loop);
}

// 启动服务器
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🎮 发票收割者服务器运行在端口 ${PORT}`);
  console.log(`📁 游戏大厅: http://localhost:${PORT}`);
});
