// Host-JVM checks for production NazStoreFiles (durable state copy). No Android runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const classes = path.join(root, 'test-results/native-store/classes');

test('production NazStoreFiles writes atomically and keeps the previous copy', { timeout: 60000 }, () => {
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  const options = { cwd: root, encoding: 'utf8', timeout: 30000 };
  execFileSync('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-d', classes,
    path.join(root, 'nazchat-apk/src/com/nazchat/app/NazStoreFiles.java'),
    path.join(root, 'tests/native-store/com/nazchat/app/NazStoreFilesTest.java')], options);
  const output = execFileSync('java', ['-Xmx256m', '-cp', classes, 'com.nazchat.app.NazStoreFilesTest'], options);
  process.stdout.write(output);
  assert.match(output, /RESULT NazStoreFiles passed; \d+ assertions/);
});
