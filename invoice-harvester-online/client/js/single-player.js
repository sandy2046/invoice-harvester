/**
 * Invoice Harvester - 单机版游戏逻辑
 * 贪吃蛇风格的发票收割游戏
 */
(function () {
  'use strict';

  // ==================== 游戏常量 ====================
  const GRID = 20;
  const CANVAS_WIDTH = 700;
  const CANVAS_HEIGHT = 560;
  const COLS = 35;
  const ROWS = 28;
  const INITIAL_FOOD_COUNT = 20;
  const COMBO_WINDOW = 1500; // 连击窗口 1.5秒
  const AI_SPAWN_INTERVAL = 20000; // 每20秒新增AI
  const MAX_AI_SNAKES = 6;
  const INITIAL_AI_COUNT = 2;
  const AI_RESPAWN_DELAY = 3000; // AI死亡后3秒重生
  const BASE_SPEED = 150; // 基础移动间隔(ms)
  const MIN_SPEED = 60; // 最快速度

  // ==================== 发票道具类型 ====================
  const INVOICE_TYPES = [
    { id: 'normal',    name: '普票',   score: 10,  emoji: '🧾', color: '#888888', weight: 35, type: 'normal' },
    { id: 'electronic',name: '电子',   score: 20,  emoji: '💻', color: '#22c55e', weight: 25, type: 'normal' },
    { id: 'special',   name: '专票',   score: 50,  emoji: '📋', color: '#3b82f6', weight: 15, type: 'normal' },
    { id: 'vat',       name: '增值税', score: 80,  emoji: '🏛️', color: '#eab308', weight: 10, type: 'normal' },
    { id: 'red',       name: '红字',   score: 100, emoji: '🔴', color: '#ef4444', weight: 5,  type: 'normal' },
    { id: 'diamond',   name: '钻石',   score: 200, emoji: '💎', color: '#a855f7', weight: 2,  type: 'normal' },
    { id: 'gold',      name: '黄金',   score: 500, emoji: '👑', color: '#f59e0b', weight: 1,  type: 'normal' },
  ];

  const POWERUP_TYPES = [
    { id: 'timer',   name: '定时', emoji: '⏰', color: '#06b6d4', type: 'powerup', duration: 10000 },
    { id: 'magnet',  name: '磁铁', emoji: '🧲', color: '#ec4899', type: 'powerup', duration: 5000 },
    { id: 'shield',  name: '护盾', emoji: '🛡️', color: '#3b82f6', type: 'powerup', duration: 0 },
    { id: 'bomb',    name: '炸弹', emoji: '💣', color: '#ef4444', type: 'powerup', duration: 0 },
    { id: 'heal',    name: '治疗', emoji: '💊', color: '#22c55e', type: 'powerup', duration: 0 },
  ];

  // ==================== 段位系统 ====================
  const RANKS = [
    { name: '职场小白',   minScore: 0,     icon: '😊' },
    { name: '初等会计',   minScore: 200,   icon: '🧑‍💼' },
    { name: '中级会计',   minScore: 600,   icon: '📊' },
    { name: '高级会计',   minScore: 1200,  icon: '🎓' },
    { name: '注册会计师', minScore: 2000,  icon: '🏅' },
    { name: '财务主管',   minScore: 4000,  icon: '💼' },
    { name: '财务总监',   minScore: 7000,  icon: '🏛️' },
    { name: 'CFO',        minScore: 10000, icon: '👑' },
    { name: '财神',       minScore: 16000, icon: '🐉' },
  ];

  // ==================== 连击倍率 ====================
  const COMBO_MULTIPLIERS = {
    2: 1.5,
    3: 2.0,
    4: 2.0, // 4连及以上都是+200%
  };

  // ==================== 游戏状态 ====================
  let gameActive = false;
  let gamePaused = false;
  let animFrameId = null;
  let gameLoopTimer = null;
  let aiSpawnTimer = null;
  let playerName = '';

  // 画布和上下文
  let canvas, ctx;

  // 玩家蛇
  let player = null;
  // AI蛇列表
  let aiSnakes = [];
  // 食物列表
  let foods = [];
  // 粒子效果列表
  let particles = [];
  // 连击状态
  let comboState = { count: 0, lastTime: 0 };
  // 分数和统计
  let score = 0;
  let invoiceCount = 0;
  let currentSpeed = BASE_SPEED;
  // 功能道具状态
  let activePowerups = { timer: 0, magnet: 0, shield: false };
  // 星空背景
  let stars = [];

  // ==================== DOM 元素引用 ====================
  let dom = {};

  function cacheDom() {
    dom.singleGameSection = document.getElementById('singleGameSection');
    dom.canvas = document.getElementById('singleGameCanvas');
    dom.spScore = document.querySelector('#spScore .score');
    dom.spInvoices = document.querySelector('#spInvoices .score');
    dom.spSpeed = document.querySelector('#spSpeed .score');
    dom.spQuitBtn = document.getElementById('spQuitBtn');
    dom.spGameOverModal = document.getElementById('spGameOverModal');
    dom.spGameOverTitle = document.getElementById('spGameOverTitle');
    dom.spGameOverResult = document.getElementById('spGameOverResult');
    dom.spRetryBtn = document.getElementById('spRetryBtn');
    dom.spBackBtn = document.getElementById('spBackBtn');
    dom.modeSection = document.getElementById('modeSection');
  }

  // ==================== 工具函数 ====================
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function weightedRandom(items) {
    const totalWeight = items.reduce(function (sum, item) { return sum + item.weight; }, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      r -= items[i].weight;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function isOccupied(x, y) {
    // 检查玩家蛇身
    if (player) {
      for (let i = 0; i < player.body.length; i++) {
        if (player.body[i].x === x && player.body[i].y === y) return true;
      }
    }
    // 检查AI蛇身
    for (let a = 0; a < aiSnakes.length; a++) {
      if (!aiSnakes[a].alive) continue;
      for (let i = 0; i < aiSnakes[a].body.length; i++) {
        if (aiSnakes[a].body[i].x === x && aiSnakes[a].body[i].y === y) return true;
      }
    }
    // 检查已有食物
    for (let i = 0; i < foods.length; i++) {
      if (foods[i].x === x && foods[i].y === y) return true;
    }
    return false;
  }

  function findFreeCell() {
    let attempts = 0;
    while (attempts < 200) {
      const x = rand(0, COLS - 1);
      const y = rand(0, ROWS - 1);
      if (!isOccupied(x, y)) return { x: x, y: y };
      attempts++;
    }
    return null;
  }

  function getRank(s) {
    let rank = RANKS[0];
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (s >= RANKS[i].minScore) {
        rank = RANKS[i];
        break;
      }
    }
    return rank;
  }

  function getComboMultiplier(count) {
    if (count >= 4) return COMBO_MULTIPLIERS[4] || 2.0;
    return COMBO_MULTIPLIERS[count] || 1.0;
  }

  // ==================== 星空背景 ====================
  function initStars() {
    stars = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        r: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawStars(time) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const alpha = s.alpha * (0.5 + 0.5 * Math.sin(time * s.twinkleSpeed + s.twinklePhase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  // ==================== 蛇的创建 ====================
  function createSnake(startX, startY, color, isPlayer) {
    const body = [];
    const len = isPlayer ? 4 : 3;
    for (let i = 0; i < len; i++) {
      body.push({ x: startX - i, y: startY });
    }
    return {
      body: body,
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      color: color,
      isPlayer: isPlayer,
      alive: true,
      speed: BASE_SPEED,
      lastMove: 0,
      respawnTimer: 0,
      aiTarget: null,
      aiRetargetTimer: 0,
    };
  }

  // ==================== 食物生成 ====================
  function spawnFood() {
    const pos = findFreeCell();
    if (!pos) return;
    // 80% 普通发票, 20% 功能发票
    const isPowerup = Math.random() < 0.2;
    let item;
    if (isPowerup) {
      item = POWERUP_TYPES[rand(0, POWERUP_TYPES.length - 1)];
    } else {
      item = weightedRandom(INVOICE_TYPES);
    }
    foods.push({
      x: pos.x,
      y: pos.y,
      item: item,
      spawnTime: Date.now(),
      glowPhase: Math.random() * Math.PI * 2,
    });
  }

  function initFoods() {
    foods = [];
    for (let i = 0; i < INITIAL_FOOD_COUNT; i++) {
      spawnFood();
    }
  }

  // ==================== 粒子系统 ====================
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.03 + 0.02,
        color: color,
        size: Math.random() * 4 + 2,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }
  }

  // ==================== AI 逻辑 ====================
  function spawnAISnake() {
    if (aiSnakes.filter(function (s) { return s.alive; }).length >= MAX_AI_SNAKES) return;
    // 在远离玩家的位置生成
    let pos;
    let attempts = 0;
    do {
      pos = { x: rand(2, COLS - 3), y: rand(2, ROWS - 3) };
      attempts++;
    } while (attempts < 50 && player && Math.abs(pos.x - player.body[0].x) < 8 && Math.abs(pos.y - player.body[0].y) < 8);

    const hue = rand(0, 30); // 红色系色相
    const color = 'hsl(' + hue + ', 80%, 50%)';
    const ai = createSnake(pos.x, pos.y, color, false);
    ai.isAI = true;
    aiSnakes.push(ai);
  }

  function updateAI(snake, now) {
    if (!snake.alive) return;

    // 定时重新选择目标
    if (now - snake.aiRetargetTimer > 500 || !snake.aiTarget) {
      snake.aiRetargetTimer = now;
      snake.aiTarget = pickAITarget(snake);
    }

    if (!snake.aiTarget) return;

    const head = snake.body[0];
    const dx = snake.aiTarget.x - head.x;
    const dy = snake.aiTarget.y - head.y;

    let newDir = { x: snake.direction.x, y: snake.direction.y };

    // 优先沿较大差距方向移动
    if (Math.abs(dx) > Math.abs(dy)) {
      newDir = { x: dx > 0 ? 1 : -1, y: 0 };
    } else if (Math.abs(dy) > 0) {
      newDir = { x: 0, y: dy > 0 ? 1 : -1 };
    }

    // 禁止180度掉头
    if (newDir.x === -snake.direction.x && newDir.y === -snake.direction.y) {
      newDir = { x: snake.direction.x, y: snake.direction.y };
    }

    // 检查新方向是否会撞墙或撞自己
    const nextX = head.x + newDir.x;
    const nextY = head.y + newDir.y;
    if (nextX < 0 || nextX >= COLS || nextY < 0 || nextY >= ROWS || isSnakeBodyCollision(snake, nextX, nextY)) {
      // 尝试另一个方向
      const alt = { x: -newDir.y, y: newDir.x };
      const altX = head.x + alt.x;
      const altY = head.y + alt.y;
      if (altX >= 0 && altX < COLS && altY >= 0 && altY < ROWS && !isSnakeBodyCollision(snake, altX, altY)) {
        newDir = alt;
      } else {
        const alt2 = { x: newDir.y, y: -newDir.x };
        const alt2X = head.x + alt2.x;
        const alt2Y = head.y + alt2.y;
        if (alt2X >= 0 && alt2X < COLS && alt2Y >= 0 && alt2Y < ROWS && !isSnakeBodyCollision(snake, alt2X, alt2Y)) {
          newDir = alt2;
        }
        // 否则保持当前方向
      }
    }

    snake.direction = newDir;
  }

  function pickAITarget(snake) {
    const head = snake.body[0];

    // 30% 概率追踪玩家
    if (player && player.alive && Math.random() < 0.3) {
      return { x: player.body[0].x, y: player.body[0].y };
    }

    // 否则找最近的食物
    let closest = null;
    let closestDist = Infinity;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const dist = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = f;
      }
    }
    return closest ? { x: closest.x, y: closest.y } : null;
  }

  function isSnakeBodyCollision(snake, x, y) {
    for (let i = 0; i < snake.body.length; i++) {
      if (snake.body[i].x === x && snake.body[i].y === y) return true;
    }
    return false;
  }

  function respawnAI(snake) {
    snake.alive = false;
    snake.respawnTimer = Date.now() + AI_RESPAWN_DELAY;
    // 爆出发票
    for (let i = 0; i < snake.body.length; i++) {
      const seg = snake.body[i];
      if (seg.x >= 0 && seg.x < COLS && seg.y >= 0 && seg.y < ROWS) {
        const pos = { x: seg.x, y: seg.y };
        if (!isOccupied(pos.x, pos.y)) {
          const item = weightedRandom(INVOICE_TYPES);
          foods.push({
            x: pos.x,
            y: pos.y,
            item: item,
            spawnTime: Date.now(),
            glowPhase: Math.random() * Math.PI * 2,
          });
        }
      }
    }
  }

  function checkAIRespawns(now) {
    for (let i = 0; i < aiSnakes.length; i++) {
      const ai = aiSnakes[i];
      if (!ai.alive && ai.respawnTimer > 0 && now >= ai.respawnTimer) {
        // 重生
        const pos = findFreeCell();
        if (pos) {
          const newAI = createSnake(pos.x, pos.y, ai.color, false);
          newAI.isAI = true;
          aiSnakes[i] = newAI;
        }
      }
    }
  }

  // ==================== 蛇的移动 ====================
  function moveSnake(snake) {
    if (!snake.alive) return;

    snake.direction = { x: snake.nextDirection.x, y: snake.nextDirection.y };
    const head = snake.body[0];
    const newHead = {
      x: head.x + snake.direction.x,
      y: head.y + snake.direction.y,
    };
    snake.body.unshift(newHead);
    snake.body.pop();
  }

  // ==================== 碰撞检测 ====================
  function checkPlayerCollisions() {
    if (!player || !player.alive) return;

    const head = player.body[0];

    // 墙壁碰撞
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      if (activePowerups.shield) {
        activePowerups.shield = false;
        // 反弹回安全区域
        head.x = Math.max(0, Math.min(COLS - 1, head.x));
        head.y = Math.max(0, Math.min(ROWS - 1, head.y));
        spawnParticles(head.x * GRID + GRID / 2, head.y * GRID + GRID / 2, '#3b82f6', 15);
        return;
      }
      gameOver('撞墙了！');
      return;
    }

    // 自身碰撞
    for (let i = 1; i < player.body.length; i++) {
      if (player.body[i].x === head.x && player.body[i].y === head.y) {
        if (activePowerups.shield) {
          activePowerups.shield = false;
          // 缩短蛇身到碰撞点
          player.body.length = i + 1;
          spawnParticles(head.x * GRID + GRID / 2, head.y * GRID + GRID / 2, '#3b82f6', 15);
          return;
        }
        gameOver('咬到自己了！');
        return;
      }
    }

    // AI蛇碰撞
    for (let a = 0; a < aiSnakes.length; a++) {
      const ai = aiSnakes[a];
      if (!ai.alive) continue;
      for (let i = 0; i < ai.body.length; i++) {
        if (ai.body[i].x === head.x && ai.body[i].y === head.y) {
          if (activePowerups.shield) {
            activePowerups.shield = false;
            // 消灭该AI蛇
            respawnAI(ai);
            spawnParticles(head.x * GRID + GRID / 2, head.y * GRID + GRID / 2, '#3b82f6', 20);
            return;
          }
          gameOver('被审计员抓住了！');
          return;
        }
      }
    }
  }

  function checkAICollisions() {
    for (let a = 0; a < aiSnakes.length; a++) {
      const ai = aiSnakes[a];
      if (!ai.alive) continue;
      const head = ai.body[0];

      // 墙壁碰撞
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        respawnAI(ai);
        continue;
      }

      // 自身碰撞
      for (let i = 1; i < ai.body.length; i++) {
        if (ai.body[i].x === head.x && ai.body[i].y === head.y) {
          respawnAI(ai);
          break;
        }
      }

      // AI之间的碰撞
      if (!ai.alive) continue;
      for (let b = 0; b < aiSnakes.length; b++) {
        if (a === b || !aiSnakes[b].alive) continue;
        for (let i = 0; i < aiSnakes[b].body.length; i++) {
          if (aiSnakes[b].body[i].x === head.x && aiSnakes[b].body[i].y === head.y) {
            respawnAI(ai);
            break;
          }
        }
        if (!ai.alive) break;
      }

      // AI撞到玩家身体
      if (!ai.alive) continue;
      if (player && player.alive) {
        for (let i = 1; i < player.body.length; i++) {
          if (player.body[i].x === head.x && player.body[i].y === head.y) {
            respawnAI(ai);
            break;
          }
        }
      }
    }
  }

  // ==================== 食物碰撞 ====================
  function checkFoodCollisions() {
    if (!player || !player.alive) return;
    const head = player.body[0];
    const now = Date.now();

    // 磁铁效果：吸引4格内发票
    if (activePowerups.magnet > now) {
      for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        const dist = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
        if (dist <= 4 && dist > 0) {
          // 向玩家移动一格
          const dx = head.x - f.x;
          const dy = head.y - f.y;
          if (Math.abs(dx) >= Math.abs(dy)) {
            f.x += dx > 0 ? 1 : -1;
          } else {
            f.y += dy > 0 ? 1 : -1;
          }
        }
      }
    }

    // 检查是否吃到食物
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      if (f.x === head.x && f.y === head.y) {
        const item = f.item;
        foods.splice(i, 1);

        // 粒子效果
        const px = head.x * GRID + GRID / 2;
        const py = head.y * GRID + GRID / 2;
        spawnParticles(px, py, item.color, 12);

        if (item.type === 'normal') {
          // 连击系统
          if (now - comboState.lastTime < COMBO_WINDOW) {
            comboState.count++;
          } else {
            comboState.count = 1;
          }
          comboState.lastTime = now;

          const multiplier = getComboMultiplier(comboState.count);
          const gained = Math.floor(item.score * multiplier);
          score += gained;
          invoiceCount++;

          // 增长蛇身
          const tail = player.body[player.body.length - 1];
          player.body.push({ x: tail.x, y: tail.y });

          // 更新速度
          updateSpeed();

          // 显示连击信息
          if (comboState.count >= 2) {
            spawnComboText(px, py, comboState.count, multiplier);
          }
        } else if (item.type === 'powerup') {
          applyPowerup(item);
        }

        // 补充食物
        spawnFood();
      }
    }

    // AI吃食物
    for (let a = 0; a < aiSnakes.length; a++) {
      const ai = aiSnakes[a];
      if (!ai.alive) continue;
      const aiHead = ai.body[0];
      for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        if (f.x === aiHead.x && f.y === aiHead.y) {
          foods.splice(i, 1);
          // AI增长
          const tail = ai.body[ai.body.length - 1];
          ai.body.push({ x: tail.x, y: tail.y });
          spawnFood();
        }
      }
    }
  }

  // ==================== 连击文字效果 ====================
  let comboTexts = [];

  function spawnComboText(x, y, count, multiplier) {
    comboTexts.push({
      x: x,
      y: y,
      text: count + '连击! x' + multiplier.toFixed(1),
      life: 1.0,
      vy: -1.5,
    });
  }

  function updateComboTexts() {
    for (let i = comboTexts.length - 1; i >= 0; i--) {
      const ct = comboTexts[i];
      ct.y += ct.vy;
      ct.life -= 0.02;
      if (ct.life <= 0) {
        comboTexts.splice(i, 1);
      }
    }
  }

  function drawComboTexts() {
    for (let i = 0; i < comboTexts.length; i++) {
      const ct = comboTexts[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, ct.life);
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.strokeText(ct.text, ct.x, ct.y);
      ctx.fillText(ct.text, ct.x, ct.y);
      ctx.restore();
    }
  }

  // ==================== 功能道具 ====================
  function applyPowerup(item) {
    const now = Date.now();
    switch (item.id) {
      case 'timer':
        // AI减速10秒
        activePowerups.timer = now + 10000;
        for (let i = 0; i < aiSnakes.length; i++) {
          if (aiSnakes[i].alive) {
            aiSnakes[i].speed = BASE_SPEED * 2;
          }
        }
        break;
      case 'magnet':
        activePowerups.magnet = now + 5000;
        break;
      case 'shield':
        activePowerups.shield = true;
        break;
      case 'bomb':
        // 消灭所有AI
        for (let i = 0; i < aiSnakes.length; i++) {
          if (aiSnakes[i].alive) {
            const aiHead = aiSnakes[i].body[0];
            spawnParticles(aiHead.x * GRID + GRID / 2, aiHead.y * GRID + GRID / 2, '#ef4444', 20);
            respawnAI(aiSnakes[i]);
          }
        }
        break;
      case 'heal':
        // 蛇身缩短50%
        if (player) {
          const newLen = Math.max(2, Math.floor(player.body.length / 2));
          player.body.length = newLen;
        }
        break;
    }
  }

  function updatePowerups() {
    const now = Date.now();
    // 定时道具到期
    if (activePowerups.timer > 0 && now >= activePowerups.timer) {
      activePowerups.timer = 0;
      // 恢复AI速度
      for (let i = 0; i < aiSnakes.length; i++) {
        if (aiSnakes[i].alive) {
          aiSnakes[i].speed = BASE_SPEED;
        }
      }
    }
  }

  // ==================== 速度更新 ====================
  function updateSpeed() {
    // 根据分数和蛇身长度调整速度
    const lengthFactor = player ? player.body.length : 4;
    currentSpeed = Math.max(MIN_SPEED, BASE_SPEED - Math.floor(score / 100) * 2 - Math.floor(lengthFactor / 5));
    if (player) {
      player.speed = currentSpeed;
    }
  }

  // ==================== 绘制函数 ====================
  function drawBackground(time) {
    // 深色太空背景
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.5, '#0d1025');
    gradient.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 星空
    drawStars(time);

    // 网格线（微弱）
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * GRID, 0);
      ctx.lineTo(x * GRID, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * GRID);
      ctx.lineTo(CANVAS_WIDTH, y * GRID);
      ctx.stroke();
    }
  }

  function drawSnake(snake, time) {
    if (!snake.alive) return;
    const body = snake.body;
    const isPlayer = snake.isPlayer;

    for (let i = body.length - 1; i >= 0; i--) {
      const seg = body[i];
      const cx = seg.x * GRID + GRID / 2;
      const cy = seg.y * GRID + GRID / 2;
      const radius = GRID / 2 - 1;

      // 身体渐变
      const ratio = i / Math.max(1, body.length - 1);
      let baseColor;
      if (isPlayer) {
        // 蓝色系
        const r = Math.floor(30 + ratio * 20);
        const g = Math.floor(100 + (1 - ratio) * 100);
        const b = Math.floor(200 + (1 - ratio) * 55);
        baseColor = 'rgb(' + r + ',' + g + ',' + b + ')';
      } else {
        // 红色系
        const r = Math.floor(200 + (1 - ratio) * 55);
        const g = Math.floor(50 + ratio * 30);
        const b = Math.floor(50 + ratio * 30);
        baseColor = 'rgb(' + r + ',' + g + ',' + b + ')';
      }

      // 光珠效果
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);

      // 发光
      ctx.shadowColor = isPlayer ? '#4488ff' : '#ff4444';
      ctx.shadowBlur = i === 0 ? 12 : 6;

      // 渐变填充
      const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, radius);
      grad.addColorStop(0, 'rgba(255,255,255,0.6)');
      grad.addColorStop(0.4, baseColor);
      grad.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = grad;
      ctx.fill();

      // 高光
      ctx.beginPath();
      ctx.arc(cx - 2, cy - 3, radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();

      ctx.restore();

      // 蛇头绘制眼睛
      if (i === 0) {
        drawSnakeEyes(cx, cy, snake.direction, isPlayer);
      }
    }

    // 护盾效果
    if (isPlayer && activePowerups.shield) {
      const head = body[0];
      const hcx = head.x * GRID + GRID / 2;
      const hcy = head.y * GRID + GRID / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(hcx, hcy, GRID, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(59,130,246,' + (0.4 + 0.3 * Math.sin(time * 0.005)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSnakeEyes(cx, cy, dir, isPlayer) {
    const eyeOffset = 4;
    const eyeRadius = 2.5;
    const pupilRadius = 1.2;

    let leftEye, rightEye;
    if (dir.x === 1) {
      // 向右
      leftEye = { x: cx + 3, y: cy - eyeOffset };
      rightEye = { x: cx + 3, y: cy + eyeOffset };
    } else if (dir.x === -1) {
      // 向左
      leftEye = { x: cx - 3, y: cy - eyeOffset };
      rightEye = { x: cx - 3, y: cy + eyeOffset };
    } else if (dir.y === -1) {
      // 向上
      leftEye = { x: cx - eyeOffset, y: cy - 3 };
      rightEye = { x: cx + eyeOffset, y: cy - 3 };
    } else {
      // 向下
      leftEye = { x: cx - eyeOffset, y: cy + 3 };
      rightEye = { x: cx + eyeOffset, y: cy + 3 };
    }

    // 眼白
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(leftEye.x, leftEye.y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rightEye.x, rightEye.y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔（朝向方向偏移）
    ctx.fillStyle = isPlayer ? '#1a1a2e' : '#2a0a0a';
    const pupilOffX = dir.x * 0.8;
    const pupilOffY = dir.y * 0.8;
    ctx.beginPath();
    ctx.arc(leftEye.x + pupilOffX, leftEye.y + pupilOffY, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rightEye.x + pupilOffX, rightEye.y + pupilOffY, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFoods(time) {
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const cx = f.x * GRID + GRID / 2;
      const cy = f.y * GRID + GRID / 2;
      const item = f.item;

      // 发光效果
      const glowIntensity = 0.5 + 0.5 * Math.sin(time * 0.003 + f.glowPhase);
      ctx.save();
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 8 + glowIntensity * 6;

      // 背景光圈
      ctx.beginPath();
      ctx.arc(cx, cy, GRID / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = item.color + '33'; // 半透明背景
      ctx.fill();

      // 边框
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6 + glowIntensity * 0.4;
      ctx.stroke();

      // Emoji图标
      ctx.globalAlpha = 1;
      ctx.font = (GRID - 4) + 'px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, cx, cy + 1);

      ctx.restore();
    }
  }

  function drawHUD() {
    const rank = getRank(score);
    ctx.save();

    // 段位显示（左上角）
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rank.icon + ' ' + rank.name, 10, 10);

    // 护盾指示
    if (activePowerups.shield) {
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('🛡️ 护盾激活', 10, 30);
    }

    // 磁铁指示
    const now = Date.now();
    if (activePowerups.magnet > now) {
      const remain = Math.ceil((activePowerups.magnet - now) / 1000);
      ctx.fillStyle = '#ec4899';
      ctx.fillText('🧲 磁铁 ' + remain + 's', 10, activePowerups.shield ? 50 : 30);
    }

    // 定时指示
    if (activePowerups.timer > now) {
      const remain = Math.ceil((activePowerups.timer - now) / 1000);
      ctx.fillStyle = '#06b6d4';
      ctx.fillText('⏰ AI减速 ' + remain + 's', 10, 70);
    }

    // 暂停提示
    if (gamePaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.font = 'bold 36px Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('已暂停', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      ctx.font = '16px Arial';
      ctx.fillStyle = '#aaa';
      ctx.fillText('按 P 键继续', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    }

    ctx.restore();
  }

  // ==================== UI 更新 ====================
  function updateUI() {
    if (dom.spScore) dom.spScore.textContent = score;
    if (dom.spInvoices) dom.spInvoices.textContent = invoiceCount;
    if (dom.spSpeed) dom.spSpeed.textContent = Math.floor(1000 / currentSpeed * 10) / 10;
  }

  // ==================== 游戏循环 ====================
  let lastPlayerMove = 0;
  let lastAIMove = 0;

  function gameLoop(timestamp) {
    if (!gameActive) return;

    animFrameId = requestAnimationFrame(gameLoop);

    if (gamePaused) {
      // 暂停时仍然绘制
      drawFrame(timestamp);
      return;
    }

    const now = Date.now();

    // 玩家移动
    if (now - lastPlayerMove >= currentSpeed) {
      lastPlayerMove = now;
      moveSnake(player);
      checkPlayerCollisions();
      checkFoodCollisions();
      if (!gameActive) return;
    }

    // AI移动
    for (let i = 0; i < aiSnakes.length; i++) {
      const ai = aiSnakes[i];
      if (!ai.alive) continue;
      const aiSpeed = activePowerups.timer > now ? BASE_SPEED * 2 : BASE_SPEED;
      if (now - (ai.lastMove || 0) >= aiSpeed) {
        ai.lastMove = now;
        updateAI(ai, now);
        moveSnake(ai);
      }
    }

    // AI碰撞检测
    checkAICollisions();

    // AI重生检查
    checkAIRespawns(now);

    // 功能道具更新
    updatePowerups();

    // 粒子更新
    updateParticles();

    // 连击文字更新
    updateComboTexts();

    // 连击超时重置
    if (comboState.count > 0 && now - comboState.lastTime > COMBO_WINDOW) {
      comboState.count = 0;
    }

    // UI更新
    updateUI();

    // 绘制
    drawFrame(timestamp);
  }

  function drawFrame(timestamp) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground(timestamp);

    // 绘制食物
    drawFoods(timestamp);

    // 绘制AI蛇
    for (let i = 0; i < aiSnakes.length; i++) {
      drawSnake(aiSnakes[i], timestamp);
    }

    // 绘制玩家蛇
    if (player) {
      drawSnake(player, timestamp);
    }

    // 绘制粒子
    drawParticles();

    // 绘制连击文字
    drawComboTexts();

    // 绘制HUD
    drawHUD();
  }

  // ==================== 输入处理 ====================
  function handleKeyDown(e) {
    if (!gameActive || !player) return;

    const key = e.key;

    // 暂停
    if (key === 'p' || key === 'P') {
      gamePaused = !gamePaused;
      e.preventDefault();
      return;
    }

    if (gamePaused) return;

    let newDir = null;

    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        newDir = { x: 0, y: -1 };
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        newDir = { x: 0, y: 1 };
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        newDir = { x: -1, y: 0 };
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        newDir = { x: 1, y: 0 };
        break;
    }

    if (newDir) {
      // 禁止180度掉头
      if (newDir.x !== -player.direction.x || newDir.y !== -player.direction.y) {
        player.nextDirection = newDir;
      }
      e.preventDefault();
    }
  }

  // ==================== 游戏开始/结束 ====================
  function startGame(name) {
    playerName = name || '玩家';
    gameActive = true;
    gamePaused = false;
    score = 0;
    invoiceCount = 0;
    currentSpeed = BASE_SPEED;
    comboState = { count: 0, lastTime: 0 };
    activePowerups = { timer: 0, magnet: 0, shield: false };
    particles = [];
    comboTexts = [];
    aiSnakes = [];
    lastPlayerMove = 0;
    lastAIMove = 0;

    // 初始化画布
    cacheDom();
    canvas = dom.canvas;
    ctx = canvas.getContext('2d');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // 初始化星空
    initStars();

    // 创建玩家蛇（居中偏左）
    player = createSnake(Math.floor(COLS / 4), Math.floor(ROWS / 2), '#4488ff', true);

    // 初始化食物
    initFoods();

    // 初始化AI蛇
    for (let i = 0; i < INITIAL_AI_COUNT; i++) {
      spawnAISnake();
    }

    // 显示游戏区域
    if (dom.singleGameSection) dom.singleGameSection.style.display = 'block';
    if (dom.spGameOverModal) dom.spGameOverModal.style.display = 'none';

    // 绑定事件
    document.addEventListener('keydown', handleKeyDown);

    // 绑定退出按钮
    if (dom.spQuitBtn) {
      dom.spQuitBtn.onclick = function () { stop(); };
    }

    // 绑定重试按钮
    if (dom.spRetryBtn) {
      dom.spRetryBtn.onclick = function () {
        if (dom.spGameOverModal) dom.spGameOverModal.style.display = 'none';
        startGame(playerName);
      };
    }

    // 绑定返回按钮
    if (dom.spBackBtn) {
      dom.spBackBtn.onclick = function () {
        stop();
        if (dom.modeSection) dom.modeSection.style.display = 'flex';
      };
    }

    // AI定时生成
    aiSpawnTimer = setInterval(function () {
      if (gameActive && !gamePaused) {
        spawnAISnake();
      }
    }, AI_SPAWN_INTERVAL);

    // 更新UI
    updateUI();

    // 启动游戏循环
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function gameOver(reason) {
    gameActive = false;

    // 清理定时器
    if (aiSpawnTimer) {
      clearInterval(aiSpawnTimer);
      aiSpawnTimer = null;
    }

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    // 移除事件
    document.removeEventListener('keydown', handleKeyDown);

    // 显示结束弹窗
    const rank = getRank(score);

    if (dom.spGameOverTitle) {
      dom.spGameOverTitle.textContent = '游戏结束';
    }
    if (dom.spGameOverResult) {
      dom.spGameOverResult.innerHTML =
        '<p style="margin:8px 0;font-size:16px;">' + reason + '</p>' +
        '<p style="margin:8px 0;">最终得分: <strong style="color:#fbbf24;font-size:24px;">' + score + '</strong></p>' +
        '<p style="margin:8px 0;">收割发票: <strong>' + invoiceCount + '</strong> 张</p>' +
        '<p style="margin:8px 0;">段位: <strong>' + rank.icon + ' ' + rank.name + '</strong></p>' +
        '<p style="margin:8px 0;">蛇身长度: <strong>' + (player ? player.body.length : 0) + '</strong></p>';
    }
    if (dom.spGameOverModal) {
      dom.spGameOverModal.style.display = 'flex';
    }
  }

  function stopGame() {
    gameActive = false;
    gamePaused = false;

    if (aiSpawnTimer) {
      clearInterval(aiSpawnTimer);
      aiSpawnTimer = null;
    }

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    document.removeEventListener('keydown', handleKeyDown);

    if (dom.singleGameSection) dom.singleGameSection.style.display = 'none';
    if (dom.spGameOverModal) dom.spGameOverModal.style.display = 'none';
  }

  // ==================== 暴露全局接口 ====================
  window.SinglePlayer = {
    start: function (name) {
      startGame(name);
    },
    stop: function () {
      stopGame();
    },
    isActive: function () {
      return gameActive;
    },
  };

})();
