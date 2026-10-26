const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
const saved = new Map();
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
  localStorage: { getItem(key) { return saved.get(key) ?? null; }, setItem(key, value) { saved.set(key, value); } },
  Image: ImageMock, requestAnimationFrame() {}, Math, console
};
vm.createContext(sandbox);
let source = fs.readFileSync(path.join(__dirname, '../dist/game.js'), 'utf8');
source = source.replace('  newRun();\n  requestAnimationFrame(animate);', '  newRun();\n  globalThis.testGame = { get game() { return game; }, newRun, recordRun, renderOverlay, enemyAttacks };\n  requestAnimationFrame(animate);');
vm.runInContext(source, sandbox);
const { testGame } = sandbox;

let game = testGame.game;
game.state = 'playing';
game.floor = 4;
game.kills = 8;
game.bosses = 1;
game.gemsCollected = 6;
game.turns = 94;
game.hp = 1;
game.monsters = [{ x: game.player.x, y: game.player.y + 1, renderX: game.player.x, renderY: game.player.y + 1, name: 'Red jelly', damage: 4, inRange: true, nextAttackAt: -1 }];
testGame.enemyAttacks();
assert.equal(game.state, 'over', 'A lethal hit ends the run');
assert.equal(game.runResult.newBest, true, 'First completed run sets a record');
assert.match(element('overlayCard').innerHTML, /New personal best!/);
assert.match(element('overlayCard').innerHTML, /MONSTERS[\s\S]*8[\s\S]*BOSSES[\s\S]*1[\s\S]*GEMS[\s\S]*6[\s\S]*STEPS[\s\S]*94/);
assert.equal(JSON.parse(saved.get('bumbles-personal-best-v1')).floor, 4, 'Best is saved in the browser');

testGame.newRun();
assert.match(element('overlayCard').innerHTML, /YOUR BEST · FLOOR 4/, 'Next run shows the previous record');
game = testGame.game;
game.state = 'over';
game.floor = 3;
game.kills = 20;
testGame.recordRun();
testGame.renderOverlay();
assert.equal(game.runResult.newBest, false, 'A shallower run cannot beat a deeper one');

testGame.newRun();
game = testGame.game;
game.state = 'over';
game.floor = 4;
game.bosses = 1;
game.kills = 9;
testGame.recordRun();
assert.equal(game.runResult.newBest, true, 'More kills break a tie on floor and bosses');
console.log('Run recap, record persistence, and personal-best comparison passed');
