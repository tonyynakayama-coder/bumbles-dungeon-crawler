const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
const context2d = new Proxy({}, { get: (target, property) => target[property] || (() => {}) });
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    style: { setProperty() {} }, classList: { toggle() {} }, textContent: '', innerHTML: '',
    setAttribute() {}, replaceChildren() {}, addEventListener() {},
    getContext() { return context2d; }, width: 600, height: 600
  });
  return elements.get(id);
}
class ImageMock { constructor() { this.complete = false; this.naturalWidth = 0; } set src(value) { this._src = value; } }
const sandbox = {
  document: { getElementById: element, querySelector: element, createElement: () => element(Symbol()), addEventListener() {} },
  window: { innerWidth: 390, innerHeight: 844, addEventListener() {} },
  Image: ImageMock, requestAnimationFrame() {}, Math, console
};
vm.createContext(sandbox);
let source = fs.readFileSync(path.join(__dirname, '../dist/game.js'), 'utf8');
source = source.replace('  newRun();\n  requestAnimationFrame(animate);', '  newRun();\n  globalThis.testGame = { get game() { return game; }, monsterStats, damageFromHit, enemyAttacks };\n  requestAnimationFrame(animate);');
vm.runInContext(source, sandbox);
const { testGame } = sandbox;
const game = testGame.game;

for (const floor of [1, 2, 5, 10, 20, 30]) {
  game.floor = floor;
  game.weapon = Math.floor(floor / 2);
  const lowGear = testGame.monsterStats(false);
  game.weapon += 8;
  const highGear = testGame.monsterStats(false);
  assert(highGear.hp > lowGear.hp, 'Monster health should follow weapon upgrades');
  assert(highGear.hp < lowGear.hp + 12, 'A lucky weapon should still feel stronger');

  for (const armor of [0, 1, 2, 4, 6, 12, 24]) {
    game.armor = armor;
    game.blocking = false;
    const ordinary = testGame.monsterStats(false);
    const boss = testGame.monsterStats(true);
    const hit = testGame.damageFromHit(ordinary, 1);
    assert(hit >= 1, `Armor ${armor} must not negate an unblocked hit on floor ${floor}`);
    assert(testGame.damageFromHit(boss, 1) >= hit, 'Bosses should hit at least as hard');
    game.blocking = true;
    assert(testGame.damageFromHit(ordinary, 1) <= hit, 'Blocking should reduce damage');
  }
}

for (const floor of [1, 2, 5, 10, 20, 30]) {
  game.floor = floor;
  game.weapon = Math.floor(floor / 2);
  game.armor = Math.floor(floor / 3);
  game.blocking = false;
  const averagePlayerHit = 6.5 + game.weapon + Math.floor((floor - 1) / 2);
  const ordinary = testGame.monsterStats(false);
  const boss = testGame.monsterStats(true);
  assert(ordinary.hp / averagePlayerHit <= 3, `Ordinary monsters take too long on floor ${floor}`);
  assert(boss.hp / averagePlayerHit <= 5, `Bosses take too long on floor ${floor}`);
  assert(testGame.damageFromHit(ordinary, 1) <= (24 + (floor - 1) * 2) / 4, `Ordinary hit is too harsh on floor ${floor}`);
}

game.floor = 10;
game.armor = 12;
game.blocking = false;
game.hp = game.maxHp = 30;
game.state = 'playing';
game.map = Array.from({ length: 15 }, () => Array(15).fill(1));
game.player = { x: 7, y: 7, renderX: 7, renderY: 7 };
game.monsters = [{ x: 7, y: 8, renderX: 7, renderY: 8, name: 'Red jelly', ...testGame.monsterStats(false), inRange: true, nextAttackAt: 0 }];
testGame.enemyAttacks();
assert(game.hp < 30, 'An armored player should take real damage in live combat');
console.log('Balance scaling and armored damage checks passed');
