#!/usr/bin/env node
// Runs every test file in order. A file that fails is run up to twice more: headless
// Chromium can occasionally read a stale localStorage value after reloading a
// file:// page (reproduced with a blank page), which breaks persistence checks
// at random. A file that passes only on a retry is reported as FLAKY; a file
// that fails three times fails the run.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [
  ['node', 'scripts/generate-launcher-icons.cjs', '--check'],
  ...['updater', 'themes', 'ui-minimal', 'phased-building', 'skills-browser', 'streaming-long-answers',
    'tools-and-budget', 'fetch-url-approval', 'preview-and-retrieval', 'studio', 'execution',
    'renderer-isolation', 'stop-native', 'comfort', 'provider-picker', 'steer-memory-mcp',
    'skill-editor-browser', 'skill-pack-v2', 'mcp-client', 'provider-delete', 'durable-state', 'ui-460', 'file-save', 'reliability-462', 'ui-470', 'ui-480', 'markdown-fences', 'attach-paste', 'artifact-card', 'offline-resume', 'orchestrator']
    .map(name => ['node', `tests/${name}.test.js`]),
  ['node', '--test', 'tests/native-secrets.test.cjs'],
  ['node', '--test', 'tests/native-store.test.cjs'],
];

const run = cmd => spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit' }).status === 0;
const failed = [], flaky = [];
for (const cmd of files) {
  const label = cmd.slice(1).join(' ');
  if (run(cmd)) continue;
  let passed = false;
  for (let attempt = 2; attempt <= 3 && !passed; attempt++) {
    console.log(`\n↻ Retry ${attempt - 1}/2: ${label}\n`);
    passed = run(cmd);
  }
  if (passed) flaky.push(label); else failed.push(label);
}
console.log('\n' + '='.repeat(60));
if (flaky.length) console.log('FLAKY (passed on retry):\n  ' + flaky.join('\n  '));
if (failed.length) { console.log('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log(`All ${files.length} test files passed${flaky.length ? ` (${flaky.length} on retry)` : ''}.`);
