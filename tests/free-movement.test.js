const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Map();
const elements = new Map();
const context2d = new Proxy({}, { get: (target, property) => target[property] || (() => {}) });
const listen = (name, type, callback) => listeners.set(`${name}:${type}`, callback);
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    style: {}, classList: { toggle() {} }, textContent: '', innerHTML: '',
    setAttribute() {}, replaceChildren() {},
    addEventListener(type, callback) { listen(id, type, callback); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    setPointerCapture() {}, getContext() { return context2d; }, width: 600, height: 600
  });
  return elements.get(id);
}
class ImageMock { constructor() { this.complete = false; this.naturalWidth = 0; } set src(value) { this._src = value; } }
const sandbox = {
  document: { getElementById: element, createElement: () => element(Symbol()), addEventListener(type, callback) { listen('document', type, callback); } },
  window: { innerWidth: 390, innerHeight: 844, addEventListener(type, callback) { listen('window', type, callback); } },
  Image: ImageMock, requestAnimationFrame() {}, Math, console
};
vm.createContext(sandbox);
let source = fs.readFileSync(path.join(__dirname, '../dist/game.js'), 'utf8');
source = source.replace('  newRun();\n  requestAnimationFrame(animate);', '  newRun();\n  globalThis.testGame = { get game() { return game; }, animate, attack, movePlayer, enemyTurn, moveEnemies };\n  requestAnimationFrame(animate);');
vm.runInContext(source, sandbox);
const testGame = sandbox.testGame;
const game = testGame.game;
const fire = (name, type, event) => listeners.get(`${name}:${type}`)(event);
const openMap = () => Array.from({ length: 15 }, () => Array(15).fill(1));
const resetPlayer = () => { game.player = { x: 7, y: 7, renderX: 7, renderY: 7, lastCellX: 7, lastCellY: 7 }; };
let time = 1000;
const frames = count => { for (let i = 0; i < count; i++) { time += 16; testGame.animate(time); } };
game.state = 'playing';
game.map = openMap();
game.monsters = [];
game.potions = [];
game.exit = { x: 14, y: 14 };
game.seen = new Set();
resetPlayer();

fire('joystick', 'pointerdown', { pointerId: 1, clientX: 78, clientY: 78, preventDefault() {} });
frames(24);
assert(game.player.x > 7.5 && game.player.y > 7.5, 'Joystick should move diagonally and continuously');
assert(!Number.isInteger(game.player.x), 'Movement should not snap to a grid');
fire('joystick', 'pointerup', { pointerId: 1 });
const stopped = { x: game.player.x, y: game.player.y };
frames(10);
assert.equal(game.player.x, stopped.x, 'Releasing the joystick stops movement');

resetPlayer();
fire('document', 'keydown', { key: 'w', preventDefault() {} });
fire('document', 'keydown', { key: 'd', preventDefault() {} });
frames(12);
assert(game.player.x > 7 && game.player.y < 7, 'Keyboard supports diagonal movement');
fire('document', 'keyup', { key: 'w' });
fire('document', 'keyup', { key: 'd' });

resetPlayer();
game.map[7][8] = 0;
fire('document', 'keydown', { key: 'd', preventDefault() {} });
frames(35);
assert(game.player.x < 7.25, 'Walls still block continuous movement');
fire('document', 'keyup', { key: 'd' });

game.map = openMap();
resetPlayer();
game.monsters = [{ x: 7, y: 9, renderX: 7, renderY: 9, boss: false, name: 'Red jelly', hp: 30, maxHp: 30, damage: 3 }];
game.hp = 24;
frames(130);
assert(game.monsters[0].y < 9, 'Enemy chases a stationary player smoothly');
assert(game.hp < 24, 'Enemy can reach and damage a stationary player');
const monsterHp = game.monsters[0].hp;
testGame.attack();
assert(game.monsters[0].hp < monsterHp, 'Player can attack an enemy at continuous combat range');

game.map = openMap();
game.map[7][6] = 0;
game.player = { x: 8, y: 7, renderX: 8, renderY: 7, lastCellX: 8, lastCellY: 7 };
game.monsters = [{ x: 4, y: 7, renderX: 4, renderY: 7, boss: false, name: 'Red jelly', hp: 30, maxHp: 30, damage: 3 }];
game.hp = 24;
frames(180);
assert(game.monsters[0].x > 6, 'Enemy should navigate around a wall while moving smoothly');

game.monsters = [];
resetPlayer();
game.exit = { x: 8, y: 7 };
game.bossDefeated = true;
testGame.movePlayer(1, 0, 160);
assert.equal(game.state, 'loot', 'Walking onto stairs still finishes the floor');
console.log('Analog and keyboard movement, walls, chase, combat, and stairs passed');
