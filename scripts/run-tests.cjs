#!/usr/bin/env node
// Runs the test files. A file that fails is run up to twice more: headless Chromium
// can occasionally read a stale localStorage value after reloading a file:// page
// (reproduced with a blank page), which breaks persistence checks at random. A file
// that passes only on a retry is reported as FLAKY; a file that fails three times
// fails the run.
//
// Usage:
//   npm test                         every file
//   npm test -- network select       only files whose name contains "network" or "select"
//   npm test -- --jobs 4             run 4 files at once (default: TEST_JOBS, else 1 on CI,
//                                    else half the CPU cores, at most 4)
// Each file starts its own browser with a fresh profile, so files can run side by side.
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [
  ['node', 'scripts/generate-launcher-icons.cjs', '--check'],
  ...['updater', 'themes', 'ui-minimal', 'phased-building', 'skills-browser', 'streaming-long-answers',
    'tools-and-budget', 'fetch-url-approval', 'preview-and-retrieval', 'studio', 'execution',
    'renderer-isolation', 'stop-native', 'comfort', 'provider-picker', 'steer-memory-mcp',
    'skill-editor-browser', 'skill-pack-v2', 'mcp-client', 'provider-delete', 'durable-state', 'ui-460', 'file-save', 'reliability-462', 'ui-470', 'ui-480', 'markdown-fences', 'attach-paste', 'artifact-card', 'offline-resume', 'orchestrator', 'integrations', 'supabase', 'agent-team', 'websearch', 'network', 'network-chat-tools', 'security-tools', 'select-picker', 'provider-test-connection', 'design-kit']
    .map(name => ['node', `tests/${name}.test.js`]),
  ['node', '--test', 'tests/native-secrets.test.cjs'],
  ['node', '--test', 'tests/native-store.test.cjs'],
  ['node', '--test', 'tests/native-dns.test.cjs'],
  ['node', '--test', 'tests/native-scan.test.cjs'],
  ['node', '--test', 'tests/native-sni.test.cjs'],
];

const args = process.argv.slice(2);
let jobs = Number(process.env.TEST_JOBS) || (process.env.CI ? 1 : Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2))));
const filters = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--jobs' || a === '-j') jobs = Number(args[++i]);
  else if (a.startsWith('--jobs=')) jobs = Number(a.slice(7));
  else filters.push(a);
}
if (!Number.isInteger(jobs) || jobs < 1) { console.error('--jobs needs a whole number of 1 or more'); process.exit(2); }

const label = cmd => cmd.slice(1).join(' ');
const selected = filters.length ? files.filter(cmd => filters.some(f => label(cmd).includes(f))) : files;
if (!selected.length) { console.error(`No test file matches: ${filters.join(', ')}`); process.exit(2); }

// With one job, output streams live as before. With several, each file's output is
// printed in one piece when that file finishes, so logs never interleave.
function run(cmd) {
  return new Promise(resolve => {
    const live = jobs === 1;
    const child = spawn(cmd[0], cmd.slice(1), { cwd: root, stdio: live ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    let out = '';
    if (!live) { child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; }); }
    child.on('close', code => { if (!live && out) process.stdout.write(out.endsWith('\n') ? out : out + '\n'); resolve(code === 0); });
    child.on('error', e => { console.error(e); resolve(false); });
  });
}

const failed = [], flaky = [];
async function runFile(cmd) {
  if (await run(cmd)) return;
  for (let attempt = 2; attempt <= 3; attempt++) {
    console.log(`\n↻ Retry ${attempt - 1}/2: ${label(cmd)}\n`);
    if (await run(cmd)) { flaky.push(label(cmd)); return; }
  }
  failed.push(label(cmd));
}

(async () => {
  const started = Date.now();
  if (jobs > 1) console.log(`Running ${selected.length} test files, ${jobs} at a time.\n`);
  const queue = [...selected];
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await runFile(queue.shift());
  }));
  const took = Math.round((Date.now() - started) / 1000);
  console.log('\n' + '='.repeat(60));
  if (flaky.length) console.log('FLAKY (passed on retry):\n  ' + flaky.join('\n  '));
  if (failed.length) { console.log('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
  const scope = selected.length === files.length ? 'All' : `Selected ${selected.length} of ${files.length}`;
  console.log(`${scope} ${selected.length === files.length ? files.length + ' ' : ''}test files passed${flaky.length ? ` (${flaky.length} on retry)` : ''} in ${Math.floor(took / 60)}m ${took % 60}s.`);
})();
