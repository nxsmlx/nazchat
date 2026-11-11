// Host-JVM check for production NazSni: TLS to a resolved address presents the original
// host name (SNI) even when the HTTPS client resets it, as Android's does. No Android runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-results/native-sni');

test('production NazSni keeps the real host name in TLS when connecting to an address', { timeout: 90000 }, () => {
  fs.rmSync(out, { recursive: true, force: true });
  const classes = path.join(out, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  const options = { cwd: root, encoding: 'utf8', timeout: 60000 };
  const ks = path.join(out, 'kita-test.p12');
  execFileSync('keytool', ['-genkeypair', '-alias', 'kita', '-keyalg', 'EC', '-groupname', 'secp256r1', '-dname', 'CN=kita.test',
    '-ext', 'SAN=dns:kita.test', '-validity', '2', '-storetype', 'PKCS12', '-keystore', ks, '-storepass', 'changeit', '-keypass', 'changeit'], options);
  execFileSync('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-d', classes,
    path.join(root, 'nazchat-apk/src/com/nazchat/app/NazSni.java'),
    path.join(root, 'tests/native-sni/com/nazchat/app/NazSniTest.java')], options);
  const output = execFileSync('java', ['-cp', classes, 'com.nazchat.app.NazSniTest', ks], options);
  process.stdout.write(output);
  assert.match(output, /RESULT NazSni passed; \d+ assertions/);
});
