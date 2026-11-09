// Host-JVM checks for production NazSecretPolicy. No Android runtime or downloads.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const classes = path.join(root, 'test-results/native-secrets/classes');

test('production NazSecretPolicy binds provider keys to one HTTPS origin', { timeout: 60000 }, () => {
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  const options = { cwd: root, encoding: 'utf8', timeout: 30000 };
  execFileSync('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-d', classes,
    path.join(root, 'nazchat-apk/src/com/nazchat/app/NazSecretPolicy.java'),
    path.join(root, 'tests/native-secrets/com/nazchat/app/NazSecretPolicyTest.java')], options);
  const output = execFileSync('java', ['-cp', classes, 'com.nazchat.app.NazSecretPolicyTest'], options);
  process.stdout.write(output);
  assert.match(output, /RESULT NazSecretPolicy passed; \d+ assertions/);
});
