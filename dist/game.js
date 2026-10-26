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
  const rarities = [
    { name: 'Common', chance: .60, weapon: 2, armor: 1 },
    { name: 'Rare', chance: .26, weapon: 4, armor: 2 },
    { name: 'Epic', chance: .11, weapon: 7, armor: 4 },
    { name: 'Legendary', chance: .03, weapon: 11, armor: 6 }
  ];
  const $ = (id) => document.getElementById(id);
  const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const key = (x, y) => `${x},${y}`;
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cellOf = entity => ({ x: Math.round(entity.x), y: Math.round(entity.y) });
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
  const environment = Object.fromEntries(['buch-dungeon', 'hyptosis-batch-1', 'kyrise-crystal'].map(name => {
    const image = new Image(); image.src = `./environment/${name}.png`;
    image.onload = () => { if (game) draw(); };
    return [name, image];
  }));
  let animationTime = 0;
  let lastFrame = 0;
  let enemyClock = 0;
  const heldKeys = new Set();
  let joystickVector = { x: 0, y: 0 };
  let joystickPointer = null;
  let attackHeld = false;
  let game;

  function newRun() {
    game = { floor: 1, hp: 24, maxHp: 24, weapon: 0, armor: 0, weaponName: 'Bare hands', armorName: 'No armor', weaponArt: 'sword', reward: null, kills: 0, bosses: 0, turns: 0, distanceTravelled: 0, state: 'start', pausedFrom: null, facing: 'down', blocking: false, nextAttackAt: 0, log: [] };
    enemyClock = 0;
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
      if (tile) monsters.push({ ...tile, renderX: tile.x, renderY: tile.y, boss: false, name: ['Red jelly', 'Cave bat', 'Iron imp'][rand(0, 2)], ...monsterStats(false) });
    }
    if (bossFloor) {
      const tile = pick(6) || pick();
      if (tile) monsters.push({ ...tile, renderX: tile.x, renderY: tile.y, boss: true, name: ['Royal jelly', 'Sun demon', 'Ancient lich'][((game.floor / 5) - 1) % 3], ...monsterStats(true) });
    }
    const potions = [];
    for (let i = 0; i < 2; i++) { const tile = pick(3); if (tile) potions.push(tile); }
    game.map = grid;
    game.player = { ...start, renderX: start.x, renderY: start.y, lastCellX: start.x, lastCellY: start.y };
    game.exit = exit;
    game.monsters = monsters;
    game.potions = potions;
    game.bossDefeated = !bossFloor;
    enemyClock = 0;
    game.exitWarned = false;
    game.seen = new Set();
    reveal();
  }

  function monsterStats(boss) {
    const hp = boss
      ? 20 + game.floor * 2 + Math.round(game.weapon * 1.5)
      : 7 + Math.floor(game.floor * 1.5) + Math.round(game.weapon * .75);
    return { hp, maxHp: hp, damage: (boss ? 4 : 2) + Math.floor(game.floor / 3) + Math.floor(game.armor / 5) };
  }

  function damageFromHit(monster, roll) {
    const raw = monster.damage + roll;
    // Armor reduces a proportion of each hit, capped at 60%; it can never make
    // an unblocked enemy harmless. Blocking is a separate, active defense.
    const reduction = Math.min(.6, game.armor / (game.armor + 4));
    const afterArmor = Math.max(1, Math.round(raw * (1 - reduction)));
    return game.blocking ? Math.round(afterArmor * .35) : afterArmor;
  }

  function reveal() {
    const playerCell = cellOf(game.player);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (Math.abs(x - playerCell.x) + Math.abs(y - playerCell.y) <= 4) game.seen.add(key(x, y));
    }
  }

  function addLog(message) {
    game.log.unshift(message);
    game.log = game.log.slice(0, 4);
  }

  // Breadth-first search follows corridors and avoids other monsters.
  // The path length is the detection range, so walls can break pursuit.
  function pathToPlayer(monster, range = 6) {
    const originCell = cellOf(monster), playerCell = cellOf(game.player);
    if (dist(originCell, playerCell) > range) return null;
    if (originCell.x === playerCell.x && originCell.y === playerCell.y) return { ...game.player, length: 0 };
    const queue = [{ ...originCell, length: 0 }];
    const seen = new Set([key(originCell.x, originCell.y)]);
    const previous = new Map();
    const occupied = new Set(game.monsters.filter(other => other !== monster).map(other => { const cell = cellOf(other); return key(cell.x, cell.y); }));
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (current.x === playerCell.x && current.y === playerCell.y) {
        let cursor = key(current.x, current.y);
        const origin = key(originCell.x, originCell.y);
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
        const target = step.length <= 1 ? game.player : step;
        monster.targetX = target.x;
        monster.targetY = target.y;
      } else if (Math.random() < .42) {
        const origin = cellOf(monster);
        const choices = Object.values(directions)
          .map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }))
          .filter(tile => game.map[tile.y]?.[tile.x] && distance(tile, game.player) > .8 && !game.monsters.some(other => other !== monster && cellOf(other).x === tile.x && cellOf(other).y === tile.y));
        if (choices.length) {
          const next = choices[rand(0, choices.length - 1)];
          monster.targetX = next.x;
          monster.targetY = next.y;
        }
      }
    }
  }

  function canOccupy(x, y, radius = .26) {
    for (const dx of [-radius, radius]) for (const dy of [-radius, radius]) {
      const cellX = Math.floor(x + dx + .5), cellY = Math.floor(y + dy + .5);
      if (!game.map[cellY]?.[cellX]) return false;
    }
    return true;
  }

  function lineClear(from, to) {
    const count = Math.ceil(distance(from, to) * 8);
    for (let step = 1; step < count; step++) {
      const portion = step / count;
      if (!canOccupy(from.x + (to.x - from.x) * portion, from.y + (to.y - from.y) * portion, .05)) return false;
    }
    return true;
  }

  function moveEnemies(delta) {
    for (const monster of game.monsters) {
      if (monster.targetX === undefined) continue;
      const dx = monster.targetX - monster.x, dy = monster.targetY - monster.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining < .02) continue;
      const speed = (monster.boss ? 1.55 : 1.85) * delta / 1000;
      const step = Math.min(speed, remaining);
      const vx = dx / remaining * step, vy = dy / remaining * step;
      const clear = (x, y) => canOccupy(x, y, .23)
        && distance({ x, y }, game.player) >= .68
        && !game.monsters.some(other => other !== monster && distance({ x, y }, other) < .58);
      if (clear(monster.x + vx, monster.y + vy)) { monster.x += vx; monster.y += vy; }
      else if (clear(monster.x + vx, monster.y)) monster.x += vx;
      else if (clear(monster.x, monster.y + vy)) monster.y += vy;
    }
  }

  function rollRarity() {
    const roll = Math.random();
    let total = 0;
    return rarities.find(rarity => (total += rarity.chance) > roll) || rarities[0];
  }

  function rollGear(kind) {
    const rarity = rollRarity();
    const isWeapon = kind === 'weapon';
    const art = isWeapon ? (Math.random() < .5 ? 'sword' : 'axe') : 'helmet';
    const power = rarity[kind] + Math.floor((game.floor - 1) / (isWeapon ? 4 : 6));
    return { kind, rarity: rarity.name, name: `${rarity.name} ${isWeapon ? art === 'axe' ? 'Battle axe' : 'Sword' : 'Armor'}`, power, art, equipped: false };
  }

  function finishFloor() {
    clearInputs();
    game.state = 'loot';
    game.reward = { floor: game.floor, opened: false, items: [] };
    addLog(`Floor ${game.floor} cleared. Your loot box is ready!`);
    sync();
  }

  function openLootBox() {
    if (game.state !== 'loot' || game.reward.opened) return;
    game.reward.opened = true;
    game.reward.items = [rollGear('weapon'), rollGear('armor')];
    for (const item of game.reward.items) {
      if (item.kind === 'weapon' && item.power > game.weapon) {
        game.weapon = item.power;
        game.weaponName = item.name;
        game.weaponArt = item.art;
        item.equipped = true;
      } else if (item.kind === 'armor' && item.power > game.armor) {
        game.armor = item.power;
        game.armorName = item.name;
        item.equipped = true;
      }
    }
    addLog('Loot box opened. Stronger gear equipped.');
    sync();
  }

  function movePlayer(dx, dy, delta) {
    if (game.state !== 'playing') return;
    game.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    const beforeX = game.player.x, beforeY = game.player.y;
    const vx = dx * 3.5 * delta / 1000, vy = dy * 3.5 * delta / 1000;
    const clear = (x, y) => canOccupy(x, y)
      && !game.monsters.some(monster => distance({ x, y }, monster) < .56);
    if (clear(game.player.x + vx, game.player.y + vy)) {
      game.player.x += vx;
      game.player.y += vy;
    } else {
      if (clear(game.player.x + vx, game.player.y)) game.player.x += vx;
      if (clear(game.player.x, game.player.y + vy)) game.player.y += vy;
    }
    const travelled = Math.hypot(game.player.x - beforeX, game.player.y - beforeY);
    if (!travelled) return;
    game.distanceTravelled += travelled;
    const steps = Math.floor(game.distanceTravelled);
    if (steps !== game.turns) {
      game.turns = steps;
      $('turnLabel').textContent = `STEPS ${String(steps).padStart(2, '0')}`;
    }
    const playerCell = cellOf(game.player);
    if (playerCell.x !== game.player.lastCellX || playerCell.y !== game.player.lastCellY) {
      game.player.lastCellX = playerCell.x;
      game.player.lastCellY = playerCell.y;
      reveal();
    }
    const potionIndex = game.potions.findIndex(p => distance(p, game.player) < .46);
    if (potionIndex >= 0) {
      game.potions.splice(potionIndex, 1);
      const healed = Math.min(game.maxHp - game.hp, 8 + Math.floor(game.floor / 3));
      game.hp += healed;
      addLog(healed ? `Found a potion. +${healed} health.` : 'Found a potion. Health is full.');
      sync();
    }
    if (distance(game.player, game.exit) < .48) {
      if (!game.bossDefeated) {
        if (!game.exitWarned) {
          game.exitWarned = true;
          addLog('The stairs are sealed. Defeat the boss!');
          sync();
        }
      } else { finishFloor(); return; }
    } else if (distance(game.player, game.exit) > .75) game.exitWarned = false;
  }

  function descend() {
    if (game.state !== 'loot' || !game.reward?.opened) return;
    game.floor++;
    game.maxHp += 2;
    game.hp = Math.min(game.maxHp, game.hp + 9);
    makeFloor();
    game.reward = null;
    game.state = 'playing';
    addLog(`Floor ${game.floor}. You catch your breath.`);
    sync();
  }

  function attack() {
    if (game.state !== 'playing' || animationTime < game.nextAttackAt) return;
    game.nextAttackAt = animationTime + 430;
    game.player.attackAt = animationTime;
    const [fx, fy] = directions[game.facing];
    const adjacent = game.monsters.filter(monster => distance(monster, game.player) <= 1.22 && lineClear(monster, game.player));
    const monster = adjacent.find(monster => ((monster.x - game.player.x) * fx + (monster.y - game.player.y) * fy) > .35) || adjacent[0];
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
      if (distance(monster, game.player) > 1.08 || !lineClear(monster, game.player)) { monster.inRange = false; continue; }
      if (!monster.inRange) {
        monster.inRange = true;
        monster.nextAttackAt = animationTime + 650;
      }
      if (animationTime < monster.nextAttackAt) continue;
      monster.nextAttackAt = animationTime + (monster.boss ? 1050 : 1450);
      monster.attackAt = animationTime;
      const incoming = damageFromHit(monster, rand(0, 2));
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
    if (game.state === 'start' || game.state === 'over' || game.state === 'loot') return;
    if (game.state === 'paused') game.state = game.pausedFrom;
    else { game.pausedFrom = game.state; game.state = 'paused'; clearInputs(); }
    sync();
  }

  function button(label, action, kind = 'primary') { return `<button type="button" class="${kind}-button" data-action="${action}">${label}</button>`; }

  function renderOverlay() {
    overlay.classList.toggle('hidden', game.state === 'playing');
    if (game.state === 'playing') return;
    if (game.state === 'start') overlayCard.innerHTML = `<span class="overlay-kicker">A QUICK DUNGEON RUN</span><h1>Enter the dungeon</h1><p>Move with the joystick or WASD. Attack nearby monsters, hold Block to defend, and reach the stairs for a loot box.</p><div class="overlay-actions">${button('Start exploring', 'start')}</div>`;
    if (game.state === 'loot') {
      const reward = game.reward;
      overlayCard.innerHTML = reward.opened
        ? `<span class="overlay-kicker">FLOOR ${reward.floor} CLEARED</span><h2>Loot box opened!</h2><div class="loot-results">${reward.items.map(item => `<div class="loot-result ${item.rarity.toLowerCase()}"><img src="./loot/${item.art}.png" alt=""><div><small>${item.rarity.toUpperCase()} ${item.kind.toUpperCase()}</small><strong>${item.name}</strong><span>+${item.power} ${item.kind === 'weapon' ? 'ATK' : 'DEF'} · ${item.equipped ? 'Equipped' : 'Current gear is stronger'}</span></div></div>`).join('')}</div><div class="overlay-actions">${button('Next floor →', 'continue')}</div>`
        : `<span class="overlay-kicker">FLOOR ${reward.floor} CLEARED</span><h2>Your loot box awaits</h2><img class="loot-chest" src="./loot/chest.png" alt="Treasure chest"><p>Open it for a weapon and armor. Rare, Epic, and Legendary finds are harder to roll.</p><div class="overlay-actions">${button('Open loot box', 'open-loot')}</div>`;
    }
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
    $('armorName').textContent = game.armorName;
    $('weaponPower').textContent = `+${game.weapon} ATK`;
    $('armorPower').textContent = `+${game.armor} DEF`;
    $('weaponIcon').src = `./loot/${game.weaponArt}.png`;
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
    game.monsters.forEach(m => { const cell = cellOf(m); if (game.seen.has(key(cell.x, cell.y))) {
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
    positionCamera();
  }

  function positionCamera() {
    const vw = window.innerWidth, vh = window.innerHeight;
    // Preserve square pixels while the camera pans across whichever axis overflows.
    const size = Math.max(vw, vh, Math.min(vw, vh) * 1.18);
    const tile = size / W;
    const left = Math.min(0, Math.max(vw - size, vw / 2 - (game.player.renderX + .5) * tile));
    const top = Math.min(0, Math.max(vh - size, vh / 2 - (game.player.renderY + .5) * tile));
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
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
        if (enemyClock >= 320) {
          enemyClock %= 320;
          enemyTurn();
        }
        const input = movementVector();
        if (input.x || input.y) movePlayer(input.x, input.y, delta);
        if (game.state === 'playing') moveEnemies(delta);
        if (game.state === 'playing') enemyAttacks();
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
  function movementVector() {
    if (joystickVector.x || joystickVector.y) return joystickVector;
    let x = 0, y = 0;
    for (const held of heldKeys) {
      const direction = movementKeys[held];
      if (direction) { x += directions[direction][0]; y += directions[direction][1]; }
    }
    const magnitude = Math.hypot(x, y);
    return magnitude ? { x: x / magnitude, y: y / magnitude } : { x: 0, y: 0 };
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
    joystickVector = { x: 0, y: 0 };
    joystickPointer = null;
    attackHeld = false;
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
    const strength = length < 6 ? 0 : Math.min(1, (length - 6) / 28);
    joystickVector = length ? { x: dx / length * strength, y: dy / length * strength } : { x: 0, y: 0 };
  }

  const joystick = $('joystick');
  joystick.addEventListener('pointerdown', event => {
    if (game.state !== 'playing') return;
    event.preventDefault();
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
  const releaseJoystick = event => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystickVector = { x: 0, y: 0 };
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
      heldKeys.add(k);
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
    else if (action === 'open-loot') openLootBox();
    else if (action === 'continue') descend();
    else if (action === 'restart') { newRun(); game.state = 'playing'; sync(); }
  });
  newRun();
  requestAnimationFrame(animate);
})();
