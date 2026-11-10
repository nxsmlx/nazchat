// Host-only behavioral tests. Production NazOAuth is compiled with test stubs,
// not android.jar. The only real library dependency is org.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const fixtures = path.join(root, 'tests/native-oauth');
const classes = path.join(root, 'test-results/native-oauth/classes');
const json = path.join(root, 'test-results/native-toolchain/json.jar');
const jsonUrl = 'https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar';
const jsonSha256 = '3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796';
function javaFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? javaFiles(file) : file.endsWith('.java') ? [file] : [];
  }).sort();
}

test('production NazOAuth host behavioral suite (no Android runtime)', { timeout: 60000 }, () => {
  if (!fs.existsSync(json)) {
    fs.mkdirSync(path.dirname(json), { recursive: true });
    execFileSync('curl', ['-fLsS', '--max-time', '45', jsonUrl, '-o', json], { timeout: 50000 });
  }
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(json)).digest('hex'), jsonSha256,
    'Test-only org.json dependency checksum mismatch');
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  const options = { cwd: root, encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024 };
  execFileSync('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8',
    '-cp', json, '-sourcepath', fixtures, '-d', classes,
    path.join(root, 'nazchat-apk/src/com/nazchat/app/NazOAuth.java'), path.join(root, 'nazchat-apk/src/com/nazchat/app/NazOAuthError.java'), ...javaFiles(fixtures)], options);
  const output = execFileSync('java', ['-cp', classes + path.delimiter + json,
    'com.nazchat.app.NazOAuthBehaviorTest'], options);
  process.stdout.write(output);
  assert.match(output, /RESULT 20 cases passed; \d+ assertions; production NazOAuth; host fixtures only/);
});
