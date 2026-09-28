(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('gameOverlay');
  const overlayCard = document.getElementById('overlayCard');
  const W = 15;
  const TILE = canvas.width / W;
  const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const names = ['THE FIRST DESCENT', 'THE DAMP HALLS', 'THE HOLLOW KEEP', 'THE DEEP VAULT', 'THE BOSS FLOOR'];
  const $ = (id) => document.getElementById(id);
  const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const key = (x, y) => `${x},${y}`;
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  let game;

  function newRun() {
    game = { floor: 1, hp: 24, maxHp: 24, kills: 0, bosses: 0, turns: 0, state: 'start', pausedFrom: null, combat: null, log: [] };
    makeFloor();
    addLog('A new descent begins.');
    sync();
  }

  function makeFloor() {
    const grid = Array.from({ length: W }, () => Array(W).fill(0));
    const rooms = [];
    for (let attempt = 0; attempt < 80 && rooms.length < 6; attempt++) {
      const width = rand(3, 5), height = rand(3, 5);
      const x = rand(1, W - width - 2), y = rand(1, W - height - 2);
      const room = { x, y, width, height, cx: x + Math.floor(width / 2), cy: y + Math.floor(height / 2) };
      if (rooms.some(r => x < r.x + r.width + 1 && x + width + 1 > r.x && y < r.y + r.height + 1 && y + height + 1 > r.y)) continue;
      for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) grid[yy][xx] = 1;
      if (rooms.length) {
        const prev = rooms[rooms.length - 1];
        let cx = prev.cx, cy = prev.cy;
        const horizontalFirst = Math.random() < .5;
        const tunnelX = () => { while (cx !== room.cx) { grid[cy][cx] = 1; cx += Math.sign(room.cx - cx); } };
        const tunnelY = () => { while (cy !== room.cy) { grid[cy][cx] = 1; cy += Math.sign(room.cy - cy); } };
        if (horizontalFirst) { tunnelX(); tunnelY(); } else { tunnelY(); tunnelX(); }
        grid[cy][cx] = 1;
      }
      rooms.push(room);
    }
    // A straight connected fallback keeps a floor playable even after unlucky room rolls.
    if (rooms.length < 2) {
      for (let y = 2; y < W - 2; y++) for (let x = 2; x < W - 2; x++) grid[y][x] = 1;
      rooms.push({ cx: 3, cy: 3 });
    }
    const start = { x: rooms[0].cx, y: rooms[0].cy };
    const floors = [];
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y][x]) floors.push({ x, y });
    // Pick a distant stair tile so every floor has a small exploration arc.
    const exit = floors.reduce((best, tile) => dist(tile, start) > dist(best, start) ? tile : best, start);
    const occupied = new Set([key(start.x, start.y), key(exit.x, exit.y)]);
    const pick = (minimumDistance = 0) => {
      const choices = floors.filter(tile => !occupied.has(key(tile.x, tile.y)) && dist(tile, start) >= minimumDistance);
      if (!choices.length) return null;
      const tile = choices[rand(0, choices.length - 1)];
      occupied.add(key(tile.x, tile.y));
      return tile;
    };
    const bossFloor = game.floor % 5 === 0;
    const monsters = [];
    const ordinaryCount = bossFloor ? 2 : Math.min(4, 2 + Math.floor(game.floor / 3));
    for (let i = 0; i < ordinaryCount; i++) {
      const tile = pick(4);
      if (tile) monsters.push({ ...tile, boss: false, name: ['Mossling', 'Cave bat', 'Stone imp'][rand(0, 2)], hp: 7 + Math.floor(game.floor * 1.5), maxHp: 7 + Math.floor(game.floor * 1.5), damage: 2 + Math.floor(game.floor / 3) });
    }
    if (bossFloor) {
      const tile = pick(6) || pick();
      if (tile) monsters.push({ ...tile, boss: true, name: ['The Burrow King', 'The Ember Warden', 'The Hollow One'][((game.floor / 5) - 1) % 3], hp: 20 + game.floor * 2, maxHp: 20 + game.floor * 2, damage: 4 + Math.floor(game.floor / 3) });
    }
    const potions = [];
    for (let i = 0; i < 2; i++) { const tile = pick(3); if (tile) potions.push(tile); }
    game.map = grid;
    game.player = start;
    game.exit = exit;
    game.monsters = monsters;
    game.potions = potions;
    game.bossDefeated = !bossFloor;
    game.seen = new Set();
    reveal();
  }

  function reveal() {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (Math.abs(x - game.player.x) + Math.abs(y - game.player.y) <= 4) game.seen.add(key(x, y));
    }
  }

  function addLog(message) {
    game.log.unshift(message);
    game.log = game.log.slice(0, 4);
  }

  function move(dx, dy) {
    if (game.state !== 'playing') return;
    const x = game.player.x + dx, y = game.player.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= W || !game.map[y][x]) return;
    const monster = game.monsters.find(m => m.x === x && m.y === y);
    if (monster) {
      game.combat = { monster, target: { x, y }, message: `${monster.name} blocks your path.` };
      game.state = 'combat';
      addLog(`Encountered ${monster.name}!`);
      sync();
      return;
    }
    game.player = { x, y };
    game.turns++;
    reveal();
    const potionIndex = game.potions.findIndex(p => p.x === x && p.y === y);
    if (potionIndex >= 0) {
      game.potions.splice(potionIndex, 1);
      const healed = Math.min(game.maxHp - game.hp, 8 + Math.floor(game.floor / 3));
      game.hp += healed;
      addLog(healed ? `Found a potion. +${healed} health.` : 'Found a potion. Health is full.');
    }
    if (x === game.exit.x && y === game.exit.y) {
      if (!game.bossDefeated) addLog('The stairs are sealed. Defeat the boss!');
      else { descend(); return; }
    }
    sync();
  }

  function descend() {
    game.floor++;
    game.maxHp += 2;
    game.hp = Math.min(game.maxHp, game.hp + 9);
    makeFloor();
    addLog(`Floor ${game.floor}. You catch your breath.`);
    sync();
  }

  function fight(action) {
    if (game.state !== 'combat') return;
    const monster = game.combat.monster;
    game.turns++;
    let message;
    if (action === 'attack') {
      const critical = Math.random() < .16;
      const damage = rand(5, 8) + Math.floor((game.floor - 1) / 2) + (critical ? 3 : 0);
      monster.hp = Math.max(0, monster.hp - damage);
      message = `${critical ? 'Critical hit! ' : ''}You deal ${damage} damage.`;
    } else {
      const damage = 2 + Math.floor(game.floor / 3);
      monster.hp = Math.max(0, monster.hp - damage);
      message = `You block and counter for ${damage}.`;
    }
    if (monster.hp <= 0) {
      game.monsters = game.monsters.filter(m => m !== monster);
      game.player = game.combat.target;
      reveal();
      game.kills++;
      if (monster.boss) {
        game.bosses++;
        game.bossDefeated = true;
        message += ' Boss defeated! The stairs open.';
      } else message += ` ${monster.name} falls.`;
      addLog(message);
      game.combat = null;
      game.state = 'playing';
      sync();
      return;
    }
    const incoming = Math.max(1, monster.damage + rand(0, 2) - (action === 'block' ? monster.damage : 0));
    game.hp = Math.max(0, game.hp - incoming);
    message += ` ${monster.name} hits for ${incoming}.`;
    addLog(message);
    game.combat.message = message;
    if (game.hp <= 0) {
      game.state = 'over';
      addLog(`Run over on floor ${game.floor}.`);
    }
    sync();
  }

  function togglePause() {
    if (game.state === 'start' || game.state === 'over') return;
    if (game.state === 'paused') game.state = game.pausedFrom;
    else { game.pausedFrom = game.state; game.state = 'paused'; }
    sync();
  }

  function button(label, action, kind = 'primary') { return `<button type="button" class="${kind}-button" data-action="${action}">${label}</button>`; }

  function renderOverlay() {
    overlay.classList.toggle('hidden', game.state === 'playing');
    if (game.state === 'playing') return;
    if (game.state === 'start') overlayCard.innerHTML = `<span class="overlay-kicker">A QUICK DUNGEON RUN</span><h1>Enter the dungeon</h1><p>Move with arrows or WASD. Fight monsters by choosing attack or block. Find the stairs and keep descending.</p><div class="overlay-actions">${button('Start exploring', 'start')}</div>`;
    if (game.state === 'paused') overlayCard.innerHTML = `<span class="overlay-kicker">TAKE A BREATHER</span><h2>Paused</h2><p>Your run is waiting right here.</p><div class="overlay-actions">${button('Resume run', 'resume')}</div>`;
    if (game.state === 'combat') {
      const monster = game.combat.monster;
      const segments = Math.ceil(monster.hp / monster.maxHp * 8);
      overlayCard.innerHTML = `<span class="overlay-kicker">MONSTER ENCOUNTER</span><h2>${monster.name}</h2><div class="battle-stat">${monster.hp} / ${monster.maxHp} HP</div><div class="battle-bars">${Array.from({length: 8}, (_, i) => `<i class="${i >= segments ? 'empty' : ''}"></i>`).join('')}</div><p>${game.combat.message}</p><div class="overlay-actions">${button('⚔ Attack', 'attack')}${button('▣ Block', 'block', 'secondary')}</div><div class="combat-tip">A to attack · B to block · Esc to pause</div>`;
    }
    if (game.state === 'over') overlayCard.innerHTML = `<span class="overlay-kicker">RUN OVER</span><h2>Deep enough?</h2><p>You reached floor ${game.floor} and defeated ${game.kills} monster${game.kills === 1 ? '' : 's'}.</p><div class="result-number">FLOOR ${String(game.floor).padStart(2, '0')}</div><div class="overlay-actions">${button('Try again', 'restart')}</div>`;
  }

  function sync() {
    $('floorValue').textContent = String(game.floor).padStart(2, '0');
    $('healthValue').textContent = `${game.hp} / ${game.maxHp}`;
    $('healthBar').style.width = `${game.hp / game.maxHp * 100}%`;
    $('killsValue').textContent = game.kills;
    $('bossesValue').textContent = game.bosses;
    $('turnLabel').textContent = `TURN ${String(game.turns).padStart(2, '0')}`;
    $('floorLabel').textContent = game.floor % 5 === 0 ? `FLOOR ${game.floor} · BOSS LAIR` : (names[(game.floor - 1) % names.length] || `FLOOR ${game.floor}`);
    $('goalText').textContent = game.bossDefeated ? 'Find the stairs' : 'Defeat the boss';
    $('goalDetail').textContent = game.bossDefeated ? 'Step onto the blue stairs to descend.' : 'The stairs open after the boss falls.';
    $('eventLog').replaceChildren(...game.log.map(message => { const el = document.createElement('div'); el.className = 'event'; el.textContent = message; return el; }));
    $('pauseButton').innerHTML = game.state === 'paused' ? '▶ <span>Resume</span>' : 'Ⅱ <span>Pause</span>';
    renderOverlay();
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0c161e'; ctx.fillRect(0, 0, 600, 600);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const px = x * TILE, py = y * TILE;
      const seen = game.seen.has(key(x, y));
      if (!seen) { ctx.fillStyle = game.map[y][x] ? '#1b2b34' : '#101b24'; ctx.fillRect(px, py, TILE, TILE); ctx.strokeStyle = '#16252d'; ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1); continue; }
      if (game.map[y][x]) {
        ctx.fillStyle = (x + y) % 2 ? '#293a43' : '#2c3e47';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#344851';
        ctx.fillRect(px + 4, py + 4, 3, 3);
        ctx.fillRect(px + 28, py + 27, 4, 2);
        ctx.strokeStyle = '#23323b'; ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = '#17252e'; ctx.fillRect(px, py, TILE, TILE);
        if ((x * 7 + y * 11) % 3 === 0) { ctx.fillStyle = '#21333e'; ctx.fillRect(px + 4, py + 5, 25, 4); ctx.fillRect(px + 12, py + 21, 24, 4); }
        ctx.fillStyle = '#0e1b23'; ctx.fillRect(px, py + 34, TILE, 6);
      }
    }
    if (game.seen.has(key(game.exit.x, game.exit.y))) drawStairs(game.exit.x, game.exit.y, game.bossDefeated);
    game.potions.forEach(p => { if (game.seen.has(key(p.x, p.y))) drawPotion(p.x, p.y); });
    game.monsters.forEach(m => { if (game.seen.has(key(m.x, m.y))) drawMonster(m); });
    drawPlayer(game.player.x, game.player.y);
  }

  function drawStairs(x, y, open) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = open ? '#182d3d' : '#39313a'; ctx.fillRect(px + 5, py + 5, 30, 30);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = open ? ['#537f9c','#6799b5','#83b9d0'][i] : '#795d60'; ctx.fillRect(px + 8 + i * 3, py + 12 + i * 6, 24 - i * 6, 5); }
    ctx.strokeStyle = open ? '#9ed9ef' : '#a77b7b'; ctx.strokeRect(px + 5.5, py + 5.5, 29, 29);
  }

  function drawPotion(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#b5e9d3'; ctx.fillRect(px + 17, py + 8, 6, 5);
    ctx.fillStyle = '#569f88'; ctx.fillRect(px + 12, py + 14, 16, 17);
    ctx.fillStyle = '#8ee0b7'; ctx.fillRect(px + 14, py + 21, 12, 8);
    ctx.fillStyle = '#e0fff0'; ctx.fillRect(px + 14, py + 16, 3, 4);
  }

  function drawMonster(monster) {
    const px = monster.x * TILE, py = monster.y * TILE;
    if (monster.boss) { ctx.fillStyle = '#f4b75e'; ctx.fillRect(px + 5, py + 4, 7, 11); ctx.fillRect(px + 28, py + 4, 7, 11); }
    ctx.fillStyle = monster.boss ? '#9c4d57' : '#a34f5c'; ctx.fillRect(px + 7, py + 12, 26, 22);
    ctx.fillStyle = monster.boss ? '#e67c68' : '#dc706c'; ctx.fillRect(px + 10, py + 9, 20, 21);
    ctx.fillStyle = '#fff1cf'; ctx.fillRect(px + 13, py + 17, 5, 5); ctx.fillRect(px + 23, py + 17, 5, 5);
    ctx.fillStyle = '#26222a'; ctx.fillRect(px + 15, py + 18, 2, 3); ctx.fillRect(px + 25, py + 18, 2, 3);
    ctx.fillStyle = '#6e3947'; ctx.fillRect(px + 14, py + 27, 12, 3);
  }

  function drawPlayer(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#102028'; ctx.fillRect(px + 8, py + 31, 26, 5);
    ctx.fillStyle = '#d28d55'; ctx.fillRect(px + 15, py + 7, 13, 11);
    ctx.fillStyle = '#f2bc5d'; ctx.fillRect(px + 11, py + 14, 21, 18);
    ctx.fillStyle = '#fff0c6'; ctx.fillRect(px + 16, py + 16, 4, 4); ctx.fillRect(px + 25, py + 16, 4, 4);
    ctx.fillStyle = '#20313a'; ctx.fillRect(px + 18, py + 17, 2, 3); ctx.fillRect(px + 27, py + 17, 2, 3);
    ctx.fillStyle = '#ae683f'; ctx.fillRect(px + 18, py + 25, 7, 2);
    ctx.fillStyle = '#e49f4d'; ctx.fillRect(px + 14, py + 31, 5, 4); ctx.fillRect(px + 25, py + 31, 5, 4);
  }

  document.addEventListener('keydown', event => {
    const movement = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (k in movement && game.state === 'playing') { event.preventDefault(); move(...directions[movement[k]]); }
    else if (k === 'Escape' && (game.state === 'playing' || game.state === 'combat' || game.state === 'paused')) { event.preventDefault(); togglePause(); }
    else if (game.state === 'combat' && k === 'a') { event.preventDefault(); fight('attack'); }
    else if (game.state === 'combat' && k === 'b') { event.preventDefault(); fight('block'); }
    else if (k === 'Enter' && game.state === 'start') { event.preventDefault(); game.state = 'playing'; sync(); }
  });

  document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => move(...directions[button.dataset.move])));
  $('pauseButton').addEventListener('click', togglePause);
  overlay.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'start' || action === 'resume') { game.state = action === 'start' ? 'playing' : game.pausedFrom; sync(); }
    else if (action === 'restart') { newRun(); game.state = 'playing'; sync(); }
    else if (action === 'attack' || action === 'block') fight(action);
  });
  newRun();
})();
