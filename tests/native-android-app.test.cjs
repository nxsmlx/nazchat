// The Android project Kita writes for "Publish → Android app" really builds: generate it in the
// app, run the generated workflow's own "Signing key" and "Build" steps with the Android SDK,
// check the APK, then build again and check that the same key signs it (updates install).
// Needs JDK 17, git, openssl, zip, jq and ANDROID_HOME with platforms;android-36 and
// build-tools;36.0.0. CI installs them; without the SDK a local run says so and stops (on CI it fails).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { launch, appUrl, root } = require('./browser');

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/opt/android-sdk';
const bt = path.join(sdk, 'build-tools/36.0.0');
const haveSdk = fs.existsSync(path.join(bt, 'lib/apksigner.jar')) && fs.existsSync(path.join(sdk, 'platforms/android-36/android.jar'));

function stepScript(workflow, name) {
  const lines = workflow.split('\n');
  const at = lines.findIndex(l => l.trim() === '- name: ' + name);
  assert.ok(at >= 0, 'workflow step missing: ' + name);
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run:/.test(l));
  const inline = lines[runAt].match(/^\s+run: (?!\|)(.+)$/);
  if (inline) return inline[1];
  const indent = lines[runAt + 1].match(/^\s*/)[0].length, out = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() && l.match(/^\s*/)[0].length < indent) break;
    out.push(l.slice(indent));
  }
  return out.join('\n');
}

test('the generated Android project builds and keeps its signing key', { timeout: 600000 }, async t => {
  if (!haveSdk) {
    if (process.env.CI) assert.fail('Android SDK 36 is missing at ' + sdk);
    t.diagnostic('SKIPPED LOCALLY: no Android SDK 36 at ' + sdk + ' (CI runs this test).');
    return;
  }
  const out = path.join(root, 'test-results/native-android-app');
  fs.rmSync(out, { recursive: true, force: true });
  const repo = path.join(out, 'repo'), remote = path.join(out, 'remote.git'), runner = path.join(out, 'runner');
  fs.mkdirSync(runner, { recursive: true });

  const b = await launch();
  let gen;
  try {
    const p = await b.newPage();
    await p.goto(appUrl);
    await p.waitForFunction(() => typeof androidAppFiles === 'function');
    gen = await p.evaluate(() => {
      const site = splitHtmlProject('<!doctype html><html><head><title>Kopi</title><style>h1{color:#7a4}</style></head><body><h1>Kopi</h1><script>document.title="ok"</script></body></html>');
      const app = { appName: androidAppName("Kopi Kita's @Cafe & Co"), packageId: androidPackageId('Naz-Dev', '2kopi-class'), versionCode: 3, versionName: '1.0.3' };
      return { app, files: androidAppFiles(app, site, androidIcons(app.appName)) };
    });
  } finally { await b.close(); }
  for (const f of gen.files) {
    const target = path.join(repo, f.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.base64 != null ? Buffer.from(f.base64, 'base64') : f.content);
  }
  const git = (...a) => execFileSync('git', ['-c', 'user.email=ci@example.com', '-c', 'user.name=ci', ...a], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-qm', 'init');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git('remote', 'add', 'origin', remote); git('push', '-q', '-u', 'origin', 'main');

  const workflow = fs.readFileSync(path.join(repo, '.github/workflows/build-apk.yml'), 'utf8');
  const signing = stepScript(workflow, 'Signing key'), build = stepScript(workflow, 'Build');
  const seed = crypto.randomBytes(32).toString('base64');
  const run = () => {
    const envFile = path.join(out, 'github_env'); fs.writeFileSync(envFile, '');
    const env = { ...process.env, ANDROID_HOME: sdk, RUNNER_TEMP: runner, GITHUB_ENV: envFile, GITHUB_REF_NAME: 'main', SEED: seed,
      GIT_AUTHOR_NAME: 'ci', GIT_AUTHOR_EMAIL: 'ci@example.com', GIT_COMMITTER_NAME: 'ci', GIT_COMMITTER_EMAIL: 'ci@example.com' };
    execFileSync('bash', ['-e', '-c', signing], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
    execFileSync('bash', ['-e', '-c', build], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const certs = execFileSync('java', ['-jar', path.join(bt, 'lib/apksigner.jar'), 'verify', '--print-certs', 'build/app.apk'], { cwd: repo, encoding: 'utf8' });
    return certs.match(/SHA-256 digest: ([0-9a-f]{64})/)[1];
  };

  const first = run();
  // The key is pushed only encrypted; the remote has it, and no plain keystore is in the repo.
  assert.ok(fs.existsSync(path.join(repo, 'signing/release.p12.enc')));
  assert.match(execFileSync('git', ['log', '--oneline', '-1', 'main'], { cwd: remote, encoding: 'utf8' }), /Add the encrypted signing key/);
  assert.equal(execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(f => /\.(p12|jks|keystore)$/.test(f)).length, 0);
  const badging = execFileSync(path.join(bt, 'aapt2'), ['dump', 'badging', 'build/app.apk'], { cwd: repo, encoding: 'utf8' });
  assert.match(badging, /package: name='com\.naz_dev\.a2kopi_class' versionCode='3' versionName='1\.0\.3'/);
  assert.match(badging, /application-label:'Kopi Kita's @Cafe & Co'/);
  assert.match(badging, /launchable-activity: name='com\.naz_dev\.a2kopi_class\.MainActivity'/);
  const listing = execFileSync('unzip', ['-l', 'build/app.apk'], { cwd: repo, encoding: 'utf8' });
  for (const f of ['assets/site/index.html', 'assets/site/css/styles.css', 'assets/site/js/app.js', 'res/mipmap-xxxhdpi-v4/ic_launcher.png', 'classes.dex']) assert.match(listing, new RegExp(f.replace(/\./g, '\\.')));
  // A second build reads the encrypted key: same signer, so the update installs over the first.
  assert.equal(run(), first);
  console.log('RESULT generated Android app built and signed twice with the same key ' + first.slice(0, 16));
});
