/**
 * 发票收割者 - 在线对战客户端
 * Socket.IO + Canvas
 */

// ==================== 全局状态 ====================
const state = {
  socket: null,
  playerName: '',
  playerId: null,
  roomId: null,
  isHost: false,
  isReady: false,
  gameState: null,
  players: new Map(),
  foods: [],
  direction: 'right',
  lastDirection: 'right',
  gameLoop: null
};

// ==================== DOM 元素 ====================
const elements = {
  // 区域
  modeSection: document.getElementById('modeSection'),
  lobbySection: document.getElementById('lobbySection'),
  roomSection: document.getElementById('roomSection'),
  gameSection: document.getElementById('gameSection'),
  gameOverModal: document.getElementById('gameOverModal'),
  createRoomModal: document.getElementById('createRoomModal'),

  // 模式选择
  playerNameInput: document.getElementById('playerName'),
  singlePlayerBtn: document.getElementById('singlePlayerBtn'),
  onlineBtn: document.getElementById('onlineBtn'),

  // 大厅
  displayName: document.getElementById('displayName'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  roomList: document.getElementById('roomList'),
  backToModeBtn: document.getElementById('backToModeBtn'),

  // 创建房间弹窗
  roomNameInput: document.getElementById('roomNameInput'),
  confirmCreateRoomBtn: document.getElementById('confirmCreateRoomBtn'),
  cancelCreateRoomBtn: document.getElementById('cancelCreateRoomBtn'),

  // 房间
  roomName: document.getElementById('roomName'),
  roomId: document.getElementById('roomId'),
  playersList: document.getElementById('playersList'),
  leaveRoomBtn: document.getElementById('leaveRoomBtn'),
  hostControls: document.getElementById('hostControls'),
  playerControls: document.getElementById('playerControls'),
  startGameBtn: document.getElementById('startGameBtn'),
  readyBtn: document.getElementById('readyBtn'),

  // 联机游戏
  canvas: document.getElementById('gameCanvas'),
  player1Score: document.getElementById('player1Score'),
  player2Score: document.getElementById('player2Score'),
  quitGameBtn: document.getElementById('quitGameBtn'),
  gameOverTitle: document.getElementById('gameOverTitle'),
  gameOverResult: document.getElementById('gameOverResult'),
  backToLobbyBtn: document.getElementById('backToLobbyBtn')
};

const ctx = elements.canvas.getContext('2d');

// ==================== 工具函数 ====================
function showSection(section) {
  elements.modeSection.classList.add('hidden');
  elements.lobbySection.classList.add('hidden');
  elements.roomSection.classList.add('hidden');
  elements.gameSection.classList.add('hidden');
  elements.gameOverModal.classList.add('hidden');
  elements.createRoomModal.classList.add('hidden');
  // 单机游戏区域也隐藏
  const spSection = document.getElementById('singleGameSection');
  const spModal = document.getElementById('spGameOverModal');
  if (spSection) spSection.classList.add('hidden');
  if (spModal) spModal.classList.add('hidden');
  section.classList.remove('hidden');
}

function generatePlayerName() {
  const adjectives = ['快乐', '聪明', '勇敢', '机智', '灵活', '敏捷'];
  const nouns = ['审计员', '会计', '财务', '出纳', '税务师', '分析师'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
}

// ==================== Socket 连接 ====================
function initSocket() {
  // 配置 Socket.IO 服务器地址
  // 生产环境使用 Render 部署的服务器，开发环境使用本地服务器
  const serverUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://invoice-harvester-server.onrender.com';

  state.socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  // 连接成功
  state.socket.on('connect', () => {
    console.log('Connected to server');
    state.playerId = state.socket.id;
  });

  // 房间列表更新
  state.socket.on('roomList', (rooms) => {
    renderRoomList(rooms);
  });

  // 房间创建成功
  state.socket.on('roomCreated', (data) => {
    state.roomId = data.roomId;
    state.isHost = data.isHost;
    // 添加房主到玩家列表
    state.players.set(state.playerId, {
      id: state.playerId,
      name: state.playerName,
      isHost: true,
      isReady: false
    });
    elements.createRoomModal.classList.add('hidden');
    enterRoom(data.roomId, data.roomName || data.roomId);
  });

  // 加入房间成功
  state.socket.on('roomJoined', (data) => {
    state.roomId = data.roomId;
    state.isHost = data.isHost;
    state.players = new Map(data.room.players.map(p => [p.id, p]));
    enterRoom(data.roomId, data.room.name || data.roomId);
  });

  // 加入失败
  state.socket.on('joinError', (data) => {
    alert(data.error);
  });

  // 新玩家加入
  state.socket.on('playerJoined', (data) => {
    state.players.set(data.player.id, data.player);
    renderPlayersList();
  });

  // 玩家离开
  state.socket.on('playerLeft', (data) => {
    state.players.delete(data.playerId);
    renderPlayersList();
  });

  // 房主变更
  state.socket.on('hostChanged', (data) => {
    state.players = new Map(data.players.map(p => [p.id, p]));
    if (data.newHostId === state.playerId) {
      state.isHost = true;
    }
    renderPlayersList();
  });

  // 玩家准备状态更新
  state.socket.on('playerReadyUpdate', (data) => {
    const player = state.players.get(data.playerId);
    if (player) {
      player.isReady = data.isReady;
    }
    renderPlayersList();
  });

  // 游戏开始
  state.socket.on('gameStarted', (data) => {
    startGame(data.gameState);
  });

  // 开始失败
  state.socket.on('startError', (data) => {
    alert(data.error);
  });

  // 游戏状态更新
  state.socket.on('gameUpdate', (data) => {
    updateGameState(data);
  });

  // 游戏结束
  state.socket.on('gameEnded', (data) => {
    endGame(data);
  });
}

// ==================== UI 渲染 ====================
function renderRoomList(rooms) {
  if (rooms.length === 0) {
    elements.roomList.innerHTML = '<div class="empty">暂无房间，点击"创建房间"开始游戏</div>';
    return;
  }

  elements.roomList.innerHTML = rooms.map(room => `
    <div class="room-item">
      <div class="room-info">
        <div class="room-id">${room.name || '房间 ' + room.id}</div>
        <div class="room-host">房主: ${room.hostName}</div>
      </div>
      <div class="room-status">
        <span class="player-count">${room.playerCount}/2 人</span>
        <button class="btn btn-primary" onclick="joinRoom('${room.id}')">加入</button>
      </div>
    </div>
  `).join('');
}

function renderPlayersList() {
  const players = Array.from(state.players.values());

  elements.playersList.innerHTML = players.map(player => {
    const isMe = player.id === state.playerId;
    const statusText = player.isHost ? '房主' : (player.isReady ? '已准备' : '未准备');
    const statusClass = player.isHost ? 'host' : (player.isReady ? 'ready' : '');

    return `
      <div class="player-item ${statusClass}">
        <div class="player-avatar">${player.name.charAt(0)}</div>
        <div class="player-details">
          <div class="player-name">
            ${player.name}
            ${isMe ? '<span class="player-tag">(你)</span>' : ''}
            ${player.isHost ? '<span class="player-tag">[房主]</span>' : ''}
          </div>
          <div class="player-status">${statusText}</div>
        </div>
      </div>
    `;
  }).join('');

  // 更新控制按钮
  if (state.isHost) {
    elements.hostControls.classList.remove('hidden');
    elements.playerControls.classList.add('hidden');
  } else {
    elements.hostControls.classList.add('hidden');
    elements.playerControls.classList.remove('hidden');
    elements.readyBtn.textContent = state.isReady ? '❌ 取消准备' : '✅ 准备';
  }
}

// ==================== 游戏逻辑 ====================
function enterRoom(roomId, roomName) {
  elements.roomName.textContent = roomName;
  elements.roomId.textContent = `(${roomId})`;
  showSection(elements.roomSection);
  renderPlayersList();
}

function joinRoom(roomId) {
  state.socket.emit('joinRoom', { roomId, playerName: state.playerName });
}

function startGame(gameState) {
  state.gameState = gameState;
  state.foods = gameState.foods;
  state.players = new Map(gameState.players.map(p => [p.id, p]));
  state.direction = state.isHost ? 'right' : 'left';
  state.lastDirection = state.direction;

  // 更新分数板
  const players = Array.from(state.players.values());
  elements.player1Score.querySelector('.name').textContent = players[0]?.name || '玩家1';
  elements.player2Score.querySelector('.name').textContent = players[1]?.name || '玩家2';

  showSection(elements.gameSection);
  startGameLoop();
}

function startGameLoop() {
  // 键盘控制
  document.addEventListener('keydown', handleKeyDown);

  // 游戏循环
  state.gameLoop = setInterval(() => {
    render();
  }, 1000 / 60);
}

function handleKeyDown(e) {
  const keyMap = {
    'ArrowUp': 'up', 'w': 'up', 'W': 'up',
    'ArrowDown': 'down', 's': 'down', 'S': 'down',
    'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right'
  };

  const newDirection = keyMap[e.key];
  if (!newDirection) return;

  e.preventDefault();

  // 防止反向移动
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (opposites[newDirection] !== state.lastDirection) {
    state.direction = newDirection;
    state.socket.emit('playerMove', { direction: newDirection });
  }
}

function updateGameState(data) {
  // 更新玩家状态
  for (const playerData of data.players) {
    const player = state.players.get(playerData.id);
    if (player) {
      player.snake = playerData.snake;
      player.score = playerData.score;
      player.isDead = playerData.isDead;
    }
  }

  // 更新食物
  state.foods = data.foods;

  // 更新分数显示
  const players = Array.from(state.players.values());
  if (players[0]) {
    elements.player1Score.querySelector('.score').textContent = players[0].score;
  }
  if (players[1]) {
    elements.player2Score.querySelector('.score').textContent = players[1].score;
  }
}

function render() {
  // 清空画布
  ctx.fillStyle = 'rgba(10, 8, 40, 0.3)';
  ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);

  // 绘制网格（可选）
  drawGrid();

  // 绘制食物
  drawFoods();

  // 绘制玩家蛇
  for (const player of state.players.values()) {
    if (!player.isDead) {
      drawSnake(player);
    }
  }
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(100, 80, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 20;

  for (let x = 0; x <= elements.canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, elements.canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= elements.canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(elements.canvas.width, y);
    ctx.stroke();
  }
}

function drawFoods() {
  const gridSize = 20;

  for (const food of state.foods) {
    const x = food.x * gridSize;
    const y = food.y * gridSize;

    // 发光效果
    ctx.shadowColor = food.color;
    ctx.shadowBlur = 15;

    // 食物背景
    ctx.fillStyle = food.color + '40';
    ctx.fillRect(x + 2, y + 2, gridSize - 4, gridSize - 4);

    // 食物图标
    ctx.shadowBlur = 0;
    ctx.fillStyle = food.color;
    ctx.font = `${gridSize - 4}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getFoodIcon(food.name), x + gridSize / 2, y + gridSize / 2 + 2);
  }
}

function getFoodIcon(name) {
  const icons = {
    '普票': '🧾', '电子': '💻', '专票': '📋', '增值税': '🏛️',
    '红字': '🔴', '钻石': '💎', '黄金': '👑'
  };
  return icons[name] || '📄';
}

function drawSnake(player) {
  const gridSize = 20;
  const isMe = player.id === state.playerId;
  const color = isMe ? '#60a5fa' : '#ec4899';

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;

  for (let i = 0; i < player.snake.length; i++) {
    const seg = player.snake[i];
    const x = seg.x * gridSize;
    const y = seg.y * gridSize;

    if (i === 0) {
      // 蛇头
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + gridSize / 2, y + gridSize / 2, gridSize / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      // 眼睛
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + gridSize / 2 + 3, y + gridSize / 2 - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 蛇身
      const alpha = 1 - (i / player.snake.length) * 0.5;
      ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.fillRect(x + 3, y + 3, gridSize - 6, gridSize - 6);
    }
  }

  ctx.shadowBlur = 0;
}

function endGame(data) {
  clearInterval(state.gameLoop);
  document.removeEventListener('keydown', handleKeyDown);

  const isWinner = data.winner && data.winner.id === state.playerId;

  elements.gameOverTitle.textContent = isWinner ? '🎉 你赢了！' : (data.winner ? '😢 你输了' : '🤝 平局');
  elements.gameOverTitle.className = isWinner ? 'winner' : (data.winner ? 'loser' : '');

  let resultHTML = '';
  if (data.winner) {
    resultHTML += `<p>🏆 获胜者: <strong>${data.winner.name}</strong></p>`;
    resultHTML += `<p>💰 得分: ${data.winner.score}</p>`;
  }

  resultHTML += '<div style="margin-top: 16px;">';
  for (const player of data.players) {
    const isMe = player.id === state.playerId;
    resultHTML += `<p>${isMe ? '👤' : '👥'} ${player.name}: ${player.score}分</p>`;
  }
  resultHTML += '</div>';

  elements.gameOverResult.innerHTML = resultHTML;
  elements.gameOverModal.classList.remove('hidden');
}

function backToLobby() {
  state.socket.emit('leaveRoom');
  state.roomId = null;
  state.isHost = false;
  state.isReady = false;
  state.gameState = null;
  state.players.clear();

  elements.gameOverModal.classList.add('hidden');
  showSection(elements.lobbySection);
  state.socket.emit('getRoomList');
}

function cleanupOnlineState() {
  if (state.socket) {
    state.socket.emit('leaveRoom');
  }
  state.roomId = null;
  state.isHost = false;
  state.isReady = false;
  state.gameState = null;
  state.players.clear();
  if (state.gameLoop) {
    clearInterval(state.gameLoop);
    state.gameLoop = null;
  }
  document.removeEventListener('keydown', handleKeyDown);
}

// ==================== 事件绑定 ====================
function bindEvents() {
  // 单机模式按钮
  elements.singlePlayerBtn.addEventListener('click', () => {
    const name = elements.playerNameInput.value.trim() || generatePlayerName();
    state.playerName = name;
    // 隐藏所有区域，显示单机游戏
    showSection(document.getElementById('singleGameSection'));
    if (typeof SinglePlayer !== 'undefined') {
      SinglePlayer.start(name);
    }
  });

  // 联机模式按钮
  elements.onlineBtn.addEventListener('click', () => {
    const name = elements.playerNameInput.value.trim() || generatePlayerName();
    state.playerName = name;
    elements.displayName.textContent = name;
    showSection(elements.lobbySection);
    state.socket.emit('getRoomList');
  });

  // 昵称回车
  elements.playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      elements.onlineBtn.click();
    }
  });

  // 返回模式选择
  elements.backToModeBtn.addEventListener('click', () => {
    cleanupOnlineState();
    showSection(elements.modeSection);
  });

  // 大厅 - 创建房间（弹出弹窗）
  elements.createRoomBtn.addEventListener('click', () => {
    elements.roomNameInput.value = '';
    elements.createRoomModal.classList.remove('hidden');
    elements.roomNameInput.focus();
  });

  // 确认创建房间
  elements.confirmCreateRoomBtn.addEventListener('click', () => {
    const roomName = elements.roomNameInput.value.trim();
    state.socket.emit('createRoom', {
      playerName: state.playerName,
      roomName: roomName || null
    });
  });

  // 取消创建房间
  elements.cancelCreateRoomBtn.addEventListener('click', () => {
    elements.createRoomModal.classList.add('hidden');
  });

  // 房间名回车确认
  elements.roomNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      elements.confirmCreateRoomBtn.click();
    }
  });

  // 刷新房间列表
  elements.refreshBtn.addEventListener('click', () => {
    state.socket.emit('getRoomList');
  });

  // 离开房间
  elements.leaveRoomBtn.addEventListener('click', () => {
    cleanupOnlineState();
    showSection(elements.lobbySection);
    state.socket.emit('getRoomList');
  });

  // 准备
  elements.readyBtn.addEventListener('click', () => {
    state.isReady = !state.isReady;
    state.socket.emit('playerReady');
  });

  // 开始游戏
  elements.startGameBtn.addEventListener('click', () => {
    state.socket.emit('startGame');
  });

  // 退出联机游戏
  elements.quitGameBtn.addEventListener('click', () => {
    cleanupOnlineState();
    showSection(elements.lobbySection);
    state.socket.emit('getRoomList');
  });

  // 游戏结束返回大厅
  elements.backToLobbyBtn.addEventListener('click', backToLobby);
}

// ==================== 初始化 ====================
function init() {
  // 设置默认昵称
  elements.playerNameInput.value = generatePlayerName();
  elements.playerNameInput.select();

  // 初始化
  initSocket();
  bindEvents();
}

// 启动
init();
