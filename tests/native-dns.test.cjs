// Host-JVM checks for production NazDnsCore (DNS-over-HTTPS rules). No Android runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const classes = path.join(root, 'test-results/native-dns/classes');

test('production NazDnsCore parses DoH answers, rewrites URLs and caches by TTL', { timeout: 60000 }, () => {
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  const options = { cwd: root, encoding: 'utf8', timeout: 30000 };
  execFileSync('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-d', classes,
    path.join(root, 'nazchat-apk/src/com/nazchat/app/NazDnsCore.java'),
    path.join(root, 'tests/native-dns/com/nazchat/app/NazDnsCoreTest.java')], options);
  const output = execFileSync('java', ['-cp', classes, 'com.nazchat.app.NazDnsCoreTest'], options);
  process.stdout.write(output);
  assert.match(output, /RESULT NazDnsCore passed; \d+ assertions/);
});
