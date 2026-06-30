const fs = require('fs');
const path = require('path');

const root = __dirname;
const enginePath = path.join(root, 'engine.js');
const src = fs.readFileSync(enginePath, 'utf8');

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

new Function(src);

const required = [
  '__HB_MADE_SHOT_UPGRADES_FINAL__',
  '__HB_BATTLE_PROGRESS_FINAL__',
  '__HB_RELIC_FUSION_FINAL__',
  '__HB_RELIC_FUSION_UX_FINAL__',
  '__HB_ENDLESS_MILESTONES_FINAL__',
  '__HB_ENDLESS_RARE_FORGE_FINAL__',
  '__HB_SAVE_SMOKE_FINAL__',
  'Game.prototype._hbQueueMakeUpgrade',
  'Game.prototype._hbMadeShotProgress',
  'Game.prototype._hbDrawFusionGuide',
  'Game.prototype._hbEndlessMilestoneInfo'
];

for (const needle of required) {
  assert(src.includes(needle), `Missing expected engine marker: ${needle}`);
}

assert(src.includes('const MAKE_GOAL=5'), 'Made-shot upgrade goal must remain 5.');
assert(src.includes("relicFusion:'two-to-one-reroll'"), 'Save migration must record relic fusion system.');
assert(!src.includes('contentLift=m.id===5'), 'Atlas act 5 card must not have a special content lift.');

console.log('Smoke OK: engine syntax and final feature markers verified.');
