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
  const spriteNames = ['hero', 'red-jelly', 'cave-bat', 'iron-imp', 'royal-jelly', 'sun-demon', 'ancient-lich', 'potion', 'stairs'];
  const sprites = Object.fromEntries(spriteNames.map(name => {
    const image = new Image();
    image.src = `./sprites/${name}.png`;
    image.onload = () => { if (game) draw(); };
    return [name, image];
  }));
  const spriteFor = name => ({ 'Red jelly': 'red-jelly', 'Cave bat': 'cave-bat', 'Iron imp': 'iron-imp', 'Royal jelly': 'royal-jelly', 'Sun demon': 'sun-demon', 'Ancient lich': 'ancient-lich' })[name];
  const monsterArt = Object.fromEntries(['red-jelly', 'cave-bat', 'iron-imp', 'royal-jelly', 'sun-demon', 'ancient-lich'].map(name => {
    const image = new Image(); image.src = `./monsters/${name}.png`;
    image.onload = () => { if (game) draw(); };
    return [name, image];
  }));
  const lootArt = Object.fromEntries(['sword', 'axe', 'helmet', 'chest'].map(name => {
    const image = new Image(); image.src = `./loot/${name}.png`;
    image.onload = () => { if (game) draw(); };
    return [name, image];
  }));
  const environment = Object.fromEntries(['buch-dungeon', 'hyptosis-batch-1', 'kyrise-crystal'].map(name => {
    const image = new Image(); image.src = `./environment/${name}.png`;
    image.onload = () => { if (game) draw(); };
    return [name, image];
  }));
  let animationTime = 0;
  let lastFrame = 0;
  let enemyClock = 0;
  let movementClock = 0;
  const heldKeys = new Set();
  let joystickDirection = null;
  let joystickPointer = null;
  let attackHeld = false;
  let game;

  function newRun() {
    game = { floor: 1, hp: 24, maxHp: 24, weapon: 0, armor: 0, weaponName: 'Bare hands', kills: 0, bosses: 0, turns: 0, state: 'start', pausedFrom: null, facing: 'down', blocking: false, nextAttackAt: 0, log: [] };
    enemyClock = 0;
    movementClock = 0;
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
      if (tile) monsters.push({ ...tile, renderX: tile.x, renderY: tile.y, boss: false, name: ['Red jelly', 'Cave bat', 'Iron imp'][rand(0, 2)], hp: 7 + Math.floor(game.floor * 1.5), maxHp: 7 + Math.floor(game.floor * 1.5), damage: 2 + Math.floor(game.floor / 3) });
    }
    if (bossFloor) {
      const tile = pick(6) || pick();
      if (tile) monsters.push({ ...tile, renderX: tile.x, renderY: tile.y, boss: true, name: ['Royal jelly', 'Sun demon', 'Ancient lich'][((game.floor / 5) - 1) % 3], hp: 20 + game.floor * 2, maxHp: 20 + game.floor * 2, damage: 4 + Math.floor(game.floor / 3) });
    }
    const potions = [];
    for (let i = 0; i < 2; i++) { const tile = pick(3); if (tile) potions.push(tile); }
    const loot = [];
    for (const kind of ['weapon', 'armor', 'chest']) {
      const tile = pick(2) || pick();
      if (tile) loot.push({ ...tile, kind, art: kind === 'weapon' ? (game.floor % 2 ? 'sword' : 'axe') : kind === 'armor' ? 'helmet' : 'chest' });
    }
    game.map = grid;
    game.player = { ...start, renderX: start.x, renderY: start.y };
    game.exit = exit;
    game.monsters = monsters;
    game.potions = potions;
    game.loot = loot;
    game.bossDefeated = !bossFloor;
    enemyClock = 0;
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

  // Breadth-first search follows corridors and avoids other monsters.
  // The path length is the detection range, so walls can break pursuit.
  function pathToPlayer(monster, range = 6) {
    if (dist(monster, game.player) > range) return null;
    const queue = [{ x: monster.x, y: monster.y, length: 0 }];
    const seen = new Set([key(monster.x, monster.y)]);
    const previous = new Map();
    const occupied = new Set(game.monsters.filter(other => other !== monster).map(other => key(other.x, other.y)));
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (current.x === game.player.x && current.y === game.player.y) {
        let cursor = key(current.x, current.y);
        const origin = key(monster.x, monster.y);
        while (previous.get(cursor) !== origin && previous.has(cursor)) cursor = previous.get(cursor);
        const [x, y] = cursor.split(',').map(Number);
        return { x, y, length: current.length };
      }
      if (current.length >= range) continue;
      for (const [dx, dy] of Object.values(directions)) {
        const x = current.x + dx, y = current.y + dy, id = key(x, y);
        if (x < 0 || y < 0 || x >= W || y >= W || !game.map[y][x] || seen.has(id) || occupied.has(id)) continue;
        seen.add(id);
        previous.set(id, key(current.x, current.y));
        queue.push({ x, y, length: current.length + 1 });
      }
    }
    return null;
  }

  function enemyTurn() {
    for (const monster of game.monsters) {
      const step = pathToPlayer(monster);
      if (step) {
        if (step.length === 1) continue;
        monster.x = step.x;
        monster.y = step.y;
      } else if (Math.random() < .42) {
        const choices = Object.values(directions)
          .map(([dx, dy]) => ({ x: monster.x + dx, y: monster.y + dy }))
          .filter(tile => game.map[tile.y]?.[tile.x] && !(tile.x === game.player.x && tile.y === game.player.y) && !game.monsters.some(other => other !== monster && other.x === tile.x && other.y === tile.y));
        if (choices.length) {
          const next = choices[rand(0, choices.length - 1)];
          monster.x = next.x;
          monster.y = next.y;
        }
      }
    }
  }

  function collectLoot(x, y) {
    const index = game.loot.findIndex(item => item.x === x && item.y === y);
    if (index < 0) return;
    const [item] = game.loot.splice(index, 1);
    if (item.kind === 'weapon') {
      game.weapon += 2;
      game.weaponName = item.art === 'axe' ? 'Battle axe' : 'Sword';
      addLog(`${game.weaponName} found! Attack +${game.weapon}.`);
    } else if (item.kind === 'armor') {
      game.armor++;
      addLog(`Armor equipped! Defense +${game.armor}.`);
    } else {
      const reward = rand(0, 2);
      if (reward === 0) { game.weapon++; addLog('Chest opened! Your weapon gains +1 attack.'); }
      else if (reward === 1) { game.armor++; addLog('Chest opened! Your armor gains +1 defense.'); }
      else { const healed = Math.min(game.maxHp - game.hp, 10); game.hp += healed; addLog(`Chest opened! Restored ${healed} health.`); }
    }
  }

  function move(dx, dy) {
    if (game.state !== 'playing') return;
    game.facing = Object.keys(directions).find(direction => directions[direction][0] === dx && directions[direction][1] === dy) || game.facing;
    const x = game.player.x + dx, y = game.player.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= W || !game.map[y][x]) return;
    const monster = game.monsters.find(m => m.x === x && m.y === y);
    if (monster) return;
    game.player.x = x;
    game.player.y = y;
    game.turns++;
    reveal();
    const potionIndex = game.potions.findIndex(p => p.x === x && p.y === y);
    if (potionIndex >= 0) {
      game.potions.splice(potionIndex, 1);
      const healed = Math.min(game.maxHp - game.hp, 8 + Math.floor(game.floor / 3));
      game.hp += healed;
      addLog(healed ? `Found a potion. +${healed} health.` : 'Found a potion. Health is full.');
    }
    collectLoot(x, y);
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

  function attack() {
    if (game.state !== 'playing' || animationTime < game.nextAttackAt) return;
    game.nextAttackAt = animationTime + 430;
    game.player.attackAt = animationTime;
    const [fx, fy] = directions[game.facing];
    const adjacent = game.monsters.filter(monster => dist(monster, game.player) === 1);
    const monster = adjacent.find(monster => monster.x === game.player.x + fx && monster.y === game.player.y + fy) || adjacent[0];
    if (!monster) { draw(); return; }
    monster.hurtAt = animationTime + 80;
    const critical = Math.random() < .16;
    const damage = rand(5, 8) + game.weapon + Math.floor((game.floor - 1) / 2) + (critical ? 3 : 0);
    monster.hp = Math.max(0, monster.hp - damage);
    let message = `${critical ? 'Critical hit! ' : ''}You deal ${damage} damage.`;
    if (monster.hp <= 0) {
      game.monsters = game.monsters.filter(m => m !== monster);
      game.kills++;
      if (monster.boss) {
        game.bosses++;
        game.bossDefeated = true;
        message += ' Boss defeated! The stairs open.';
      } else message += ` ${monster.name} falls.`;
    }
    addLog(message);
    sync();
  }

  function enemyAttacks() {
    for (const monster of game.monsters) {
      if (dist(monster, game.player) !== 1) { monster.inRange = false; continue; }
      if (!monster.inRange) {
        monster.inRange = true;
        monster.nextAttackAt = animationTime + 650;
      }
      if (animationTime < monster.nextAttackAt) continue;
      monster.nextAttackAt = animationTime + (monster.boss ? 1050 : 1450);
      monster.attackAt = animationTime;
      const incoming = Math.max(0, monster.damage + rand(0, 2) - game.armor - (game.blocking ? 4 : 0));
      game.hp = Math.max(0, game.hp - incoming);
      if (incoming) game.player.hurtAt = animationTime + 110;
      addLog(incoming ? `${monster.name} hits for ${incoming}.` : `Blocked ${monster.name}'s attack!`);
      if (game.hp <= 0) {
        game.state = 'over';
        addLog(`Run over on floor ${game.floor}.`);
        clearInputs();
      }
      sync();
      if (game.state === 'over') return;
    }
  }

  function togglePause() {
    if (game.state === 'start' || game.state === 'over') return;
    if (game.state === 'paused') game.state = game.pausedFrom;
    else { game.pausedFrom = game.state; game.state = 'paused'; clearInputs(); }
    sync();
  }

  function button(label, action, kind = 'primary') { return `<button type="button" class="${kind}-button" data-action="${action}">${label}</button>`; }

  function renderOverlay() {
    overlay.classList.toggle('hidden', game.state === 'playing');
    if (game.state === 'playing') return;
    if (game.state === 'start') overlayCard.innerHTML = `<span class="overlay-kicker">A QUICK DUNGEON RUN</span><h1>Enter the dungeon</h1><p>Use the left joystick or WASD to move. Attack nearby monsters at any time; hold Block when they strike. Find gear and the stairs.</p><div class="overlay-actions">${button('Start exploring', 'start')}</div>`;
    if (game.state === 'paused') overlayCard.innerHTML = `<span class="overlay-kicker">TAKE A BREATHER</span><h2>Paused</h2><p>Your run is waiting right here.</p><div class="overlay-actions">${button('Resume run', 'resume')}</div>`;
    if (game.state === 'over') overlayCard.innerHTML = `<span class="overlay-kicker">RUN OVER</span><h2>Deep enough?</h2><p>You reached floor ${game.floor} and defeated ${game.kills} monster${game.kills === 1 ? '' : 's'}.</p><div class="result-number">FLOOR ${String(game.floor).padStart(2, '0')}</div><div class="overlay-actions">${button('Try again', 'restart')}</div>`;
  }

  function sync() {
    $('floorValue').textContent = String(game.floor).padStart(2, '0');
    $('healthValue').textContent = `${game.hp} / ${game.maxHp}`;
    $('healthBar').style.width = `${game.hp / game.maxHp * 100}%`;
    $('killsValue').textContent = game.kills;
    $('bossesValue').textContent = game.bosses;
    $('turnLabel').textContent = `STEPS ${String(game.turns).padStart(2, '0')}`;
    $('weaponName').textContent = game.weaponName;
    $('weaponPower').textContent = `+${game.weapon} ATK`;
    $('armorPower').textContent = `+${game.armor} DEF`;
    $('weaponIcon').src = `./loot/${game.weaponName === 'Battle axe' ? 'axe' : 'sword'}.png`;
    $('floorLabel').textContent = game.floor % 5 === 0 ? `FLOOR ${game.floor} · BOSS LAIR` : (names[(game.floor - 1) % names.length] || `FLOOR ${game.floor}`);
    $('goalText').textContent = game.bossDefeated ? 'Find the stairs' : 'Defeat the boss';
    $('goalDetail').textContent = game.bossDefeated ? 'Step onto the blue stairs to descend.' : 'The stairs open after the boss falls.';
    $('eventLog').replaceChildren(...game.log.map(message => { const el = document.createElement('div'); el.className = 'event'; el.textContent = message; return el; }));
    $('pauseButton').innerHTML = game.state === 'paused' ? '▶ <span>Resume</span>' : 'Ⅱ <span>Pause</span>';
    $('blockButton').setAttribute('aria-pressed', String(game.blocking));
    $('blockButton').classList.toggle('active', game.blocking);
    renderOverlay();
    draw();
  }

  function draw() {
    if (!game) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c161e'; ctx.fillRect(0, 0, 600, 600);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const px = x * TILE, py = y * TILE;
      const seen = game.seen.has(key(x, y));
      const isFloor = !!game.map[y][x];
      const variant = (x * 7 + y * 11) % 3;
      const atlas = environment['buch-dungeon'];
      if (atlas.complete && atlas.naturalWidth) {
        const source = isFloor
          ? [[48, 48, 16, 16], [64, 48, 16, 16], [48, 80, 16, 16]][variant]
          : [[48, 160, 32, 32], [48, 176, 32, 32], [48, 264, 32, 32]][variant];
        ctx.drawImage(atlas, ...source, px, py, TILE, TILE);
      } else { ctx.fillStyle = isFloor ? '#35414a' : '#29333b'; ctx.fillRect(px, py, TILE, TILE); }
      if (seen && !isFloor && [directions.up, directions.down, directions.left, directions.right].some(([dx, dy]) => game.map[y + dy]?.[x + dx])) {
        if ((x * 17 + y * 23) % 13 === 0) {
          const props = environment['hyptosis-batch-1'];
          if (props.complete && props.naturalWidth) ctx.drawImage(props, 192, 896, 32, 32, px + 5, py + 4, TILE - 10, TILE - 8);
        } else if ((x * 13 + y * 7) % 17 === 0) {
          const crystal = environment['kyrise-crystal'];
          if (crystal.complete && crystal.naturalWidth) ctx.drawImage(crystal, px + 10, py + 11, TILE - 20, TILE - 20);
        }
      }
      ctx.fillStyle = seen ? '#0c1b2229' : '#08131adf';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = seen ? '#17283255' : '#10202988';
      ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
    }
    const frame = Math.floor(animationTime / 210) % 4;
    if (game.seen.has(key(game.exit.x, game.exit.y))) {
      if (sprites.stairs.complete && sprites.stairs.naturalWidth) {
        drawSprite(ctx, 'stairs', game.exit.x * TILE, game.exit.y * TILE, game.bossDefeated ? 0 : 3, frame, TILE);
        if (!game.bossDefeated) { ctx.fillStyle = '#a54d4d66'; ctx.fillRect(game.exit.x * TILE + 4, game.exit.y * TILE + 4, 32, 32); }
      } else drawStairs(game.exit.x, game.exit.y, game.bossDefeated);
    }
    game.potions.forEach(p => { if (game.seen.has(key(p.x, p.y))) {
      if (sprites.potion.complete && sprites.potion.naturalWidth) drawSprite(ctx, 'potion', p.x * TILE, p.y * TILE, 0, frame, TILE);
      else drawPotion(p.x, p.y);
    } });
    game.loot.forEach(item => {
      if (!game.seen.has(key(item.x, item.y))) return;
      const art = lootArt[item.art];
      const px = item.x * TILE, py = item.y * TILE;
      if (art.complete && art.naturalWidth) ctx.drawImage(art, px + 4, py + 4, TILE - 8, TILE - 8);
      if (item.kind === 'chest') {
        ctx.fillStyle = '#f5c66b'; ctx.fillRect(px + 17, py + 17, 6, 6);
      }
    });
    game.monsters.forEach(m => { if (game.seen.has(key(m.x, m.y))) {
      const sprite = monsterArt[spriteFor(m.name)];
      if (sprite?.complete && sprite.naturalWidth) drawMonsterArt(ctx, m, m.renderX * TILE, m.renderY * TILE, TILE);
      else drawMonster(m);
      if (m.hp < m.maxHp) {
        ctx.fillStyle = '#18242b'; ctx.fillRect(m.renderX * TILE + 5, m.renderY * TILE + 2, 30, 4);
        ctx.fillStyle = '#e97872'; ctx.fillRect(m.renderX * TILE + 5, m.renderY * TILE + 2, 30 * m.hp / m.maxHp, 4);
      }
    } });
    if (sprites.hero.complete && sprites.hero.naturalWidth) drawSprite(ctx, 'hero', game.player.renderX * TILE, game.player.renderY * TILE, entityState(game.player), entityFrame(game.player, frame), TILE);
    else drawPlayer(game.player.x, game.player.y);
    if (game.blocking) {
      ctx.strokeStyle = '#a9dcf3'; ctx.lineWidth = 3;
      ctx.strokeRect(game.player.renderX * TILE + 3, game.player.renderY * TILE + 3, TILE - 6, TILE - 6);
      ctx.lineWidth = 1;
    }
    if (entityState(game.player) === 2) {
      const [dx, dy] = directions[game.facing];
      const px = game.player.renderX * TILE + TILE / 2 + dx * TILE * .75;
      const py = game.player.renderY * TILE + TILE / 2 + dy * TILE * .75;
      ctx.strokeStyle = '#f8d17b'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 1.5); ctx.stroke(); ctx.lineWidth = 1;
    }
  }

  function entityState(entity) {
    if (entity.attackAt !== undefined && animationTime >= entity.attackAt && animationTime - entity.attackAt < 520) return 2;
    if (entity.hurtAt !== undefined && animationTime >= entity.hurtAt && animationTime - entity.hurtAt < 320) return 3;
    if (Math.abs(entity.renderX - entity.x) + Math.abs(entity.renderY - entity.y) > .04) return 1;
    return 0;
  }

  function entityFrame(entity, idleFrame) {
    if (entityState(entity) === 2) return Math.min(3, Math.floor((animationTime - entity.attackAt) / 130));
    return idleFrame;
  }

  function drawSprite(target, name, x, y, state, frame, size) {
    target.imageSmoothingEnabled = false;
    target.drawImage(sprites[name], frame * 32, state * 32, 32, 32, Math.round(x), Math.round(y), size, size);
  }

  function drawMonsterArt(target, monster, x, y, size) {
    const art = monsterArt[spriteFor(monster.name)];
    const frames = Math.max(1, Math.floor(art.naturalWidth / 64));
    const frame = Math.floor(animationTime / 170 + monster.x + monster.y) % frames;
    const striking = entityState(monster) === 2;
    const lunge = striking ? Math.sin((animationTime - monster.attackAt) / 520 * Math.PI) * 8 : 0;
    x += Math.sign(game.player.x - monster.x) * lunge;
    y += Math.sign(game.player.y - monster.y) * lunge;
    target.imageSmoothingEnabled = false;
    target.drawImage(art, frame * 64, 0, 64, 64, Math.round(x), Math.round(y), size, size);
    if (striking) {
      target.strokeStyle = '#f5ab7d'; target.lineWidth = 2;
      target.strokeRect(Math.round(x) + 4, Math.round(y) + 4, size - 8, size - 8);
      target.lineWidth = 1;
    }
  }

  function animate(timestamp) {
    const delta = lastFrame ? Math.min(50, timestamp - lastFrame) : 16;
    lastFrame = timestamp;
    if (game && game.state !== 'paused') {
      animationTime += delta;
      if (game.state === 'playing') {
        if (attackHeld) attack();
        enemyClock += delta;
        if (enemyClock >= 950) {
          enemyClock -= 950;
          enemyTurn();
        }
        movementClock += delta;
        if (movementClock >= 165) {
          movementClock %= 165;
          const direction = activeDirection();
          if (direction) move(...directions[direction]);
        }
        enemyAttacks();
      }
      const slide = Math.min(1, delta / 90);
      const entities = [game.player, ...game.monsters];
      for (const entity of entities) {
        entity.renderX += (entity.x - entity.renderX) * slide;
        entity.renderY += (entity.y - entity.renderY) * slide;
      }
      draw();
    }
    requestAnimationFrame(animate);
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

  const movementKeys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  function activeDirection() {
    if (joystickDirection) return joystickDirection;
    return Array.from(heldKeys).reverse().map(key => movementKeys[key]).find(Boolean) || null;
  }

  function setBlocking(value) {
    if (!game || game.state !== 'playing') value = false;
    game.blocking = value;
    $('blockButton').setAttribute('aria-pressed', String(value));
    $('blockButton').classList.toggle('active', value);
    draw();
  }

  function clearInputs() {
    heldKeys.clear();
    joystickDirection = null;
    joystickPointer = null;
    attackHeld = false;
    movementClock = 0;
    $('joystickThumb').style.transform = 'translate(0, 0)';
    setBlocking(false);
  }

  function updateJoystick(event) {
    const rect = $('joystick').getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = Math.min(1, 34 / (length || 1));
    $('joystickThumb').style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    joystickDirection = length < 12 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  const joystick = $('joystick');
  joystick.addEventListener('pointerdown', event => {
    if (game.state !== 'playing') return;
    event.preventDefault();
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
    if (joystickDirection) move(...directions[joystickDirection]);
    movementClock = 0;
  });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
  const releaseJoystick = event => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystickDirection = null;
    $('joystickThumb').style.transform = 'translate(0, 0)';
  };
  joystick.addEventListener('pointerup', releaseJoystick);
  joystick.addEventListener('pointercancel', releaseJoystick);
  joystick.addEventListener('lostpointercapture', releaseJoystick);

  $('attackButton').addEventListener('pointerdown', event => { event.preventDefault(); attackHeld = true; attack(); });
  for (const name of ['pointerup', 'pointercancel', 'pointerleave']) $('attackButton').addEventListener(name, () => { attackHeld = false; });
  $('blockButton').addEventListener('pointerdown', event => { event.preventDefault(); setBlocking(true); });
  for (const name of ['pointerup', 'pointercancel', 'pointerleave']) $('blockButton').addEventListener(name, () => setBlocking(false));
  document.addEventListener('keydown', event => {
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (k in movementKeys && game.state === 'playing') {
      event.preventDefault();
      if (!heldKeys.has(k)) { heldKeys.add(k); move(...directions[movementKeys[k]]); movementClock = 0; }
    } else if (k === 'Escape' && (game.state === 'playing' || game.state === 'paused')) { event.preventDefault(); togglePause(); }
    else if ((k === ' ' || k === 'j') && game.state === 'playing') { event.preventDefault(); attackHeld = true; attack(); }
    else if ((k === 'Shift' || k === 'k') && game.state === 'playing') { event.preventDefault(); setBlocking(true); }
    else if (k === 'Enter' && game.state === 'start') { event.preventDefault(); game.state = 'playing'; sync(); }
  });
  document.addEventListener('keyup', event => {
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    heldKeys.delete(k);
    if (k === ' ' || k === 'j') attackHeld = false;
    if (k === 'Shift' || k === 'k') setBlocking(false);
  });
  window.addEventListener('blur', clearInputs);
  $('pauseButton').addEventListener('click', togglePause);
  overlay.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'start' || action === 'resume') { game.state = action === 'start' ? 'playing' : game.pausedFrom; sync(); }
    else if (action === 'restart') { newRun(); game.state = 'playing'; sync(); }
  });
  newRun();
  requestAnimationFrame(animate);
})();
