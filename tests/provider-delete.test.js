'use strict';
const assert = require('node:assert/strict');
const {launch, appUrl} = require('./browser');

// Native secrets are mocked independently of networking. All keys are fake fixtures.
const specialName = '<img src=x onerror="window.deleteNameInjected=true"> & "Delete me"';
const deletedRef = 'draft:delete-fixture-ref';
const keptRef = 'vault:keep-fixture-ref';
function fixture({active = 'delete', last = false, shared = false} = {}) {
  const provider = (id, name, ref, models) => ({
    id, name, secretRef: ref, apiKey: 'fixture-not-a-real-key-' + ref,
    baseUrl: 'https://provider.invalid/v1', endpointMode: 'base',
    apiType: 'chat_completions', headers: [{key: 'X-Fixture', value: id}],
    selectedModels: models, modelMeta: {}, capabilities: {}, createdAt: 1
  });
  const providers = [provider('p-delete', specialName, deletedRef, ['deleted-model'])];
  if (!last) providers.push(provider('p-keep', 'Kept provider', shared ? deletedRef : keptRef, ['fallback-first', 'kept-chosen']));
  const pid = active === 'keep' ? 'p-keep' : 'p-delete';
  const mid = active === 'keep' ? 'kept-chosen' : 'deleted-model';
  return {
    schemaVersion: 3, onboardingDone: true, providers,
    lastProviderId: pid, lastModelId: mid,
    conversations: [{id: 'chat-kept', title: 'Existing readable chat', providerId: pid,
      modelId: mid, projectId: 'project-kept', createdAt: 1, updatedAt: 2,
      messages: [{id: 'user-kept', role: 'user', content: 'Keep this question', timestamp: 1},
        {id: 'answer-kept', role: 'assistant', content: 'Keep this answer and its artifact.', timestamp: 2}]}],
    projects: [{id: 'project-kept', name: 'Kept project', instructions: 'Keep project notes', sources: []}],
    activeProjectId: 'project-kept',
    artifacts: [{id: 'artifact-kept', conversationId: 'chat-kept', messageId: 'answer-kept',
      title: 'Kept artifact', language: 'html', content: '<p>Kept artifact</p>', createdAt: 2}],
    prompts: [{id: 'prompt-kept', title: 'Kept prompt', content: 'Keep prompt'}],
    styles: [{id: 'style-kept', name: 'Kept style', instructions: 'Be clear'}],
    memory: {enabled: true, items: [{id: 'memory-kept', text: 'Keep this preference', createdAt: 1}]},
    mcpServers: [{id: 'mcp-kept', name: 'Kept MCP', url: 'https://mcp.invalid', enabled: false}],
    mcpConfirm: true,
    parametersByModel: {'p-delete:deleted-model': {temperature: 0.2},
      'p-delete:unused-model': {top_p: 0.5}, 'p-keep:kept-chosen': {temperature: 0.4},
      'p-delete-extra:model': {temperature: 0.8}, default: {top_p: 0.9}}
  };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    db: JSON.parse(JSON.stringify(db)), stored: JSON.parse(localStorage.getItem('nazchat_v1')),
    secrets: JSON.parse(JSON.stringify(window.secretMock.values)),
    removes: [...window.secretMock.removes], clears: window.secretMock.clears
  }));
}
function unrelated(db) {
  const {providers, parametersByModel, lastProviderId, lastModelId, ...rest} = db;
  return rest;
}
async function openProviders(page) {
  await page.locator('#menuBtn').click();
  await page.locator('#settingsBtn').click();
  assert.equal(await page.locator('#setSheetTitle').innerText(), 'Settings');
  await page.locator('.settings-hub-row').filter({has: page.locator('strong', {hasText: /^Providers$/})}).click();
  assert.equal(await page.locator('#setSheetTitle').innerText(), 'Providers');
}
async function editDeleted(page) {
  await page.locator('.provider-card').filter({hasText: specialName}).click();
  assert.equal(await page.locator('#provFormTitle').innerText(), 'Edit Provider');
  assert.equal(await page.getByRole('button', {name: 'Delete provider', exact: true}).count(), 1);
}
async function askDelete(page) {
  await page.locator('#deleteProviderBtn').click();
  await page.locator('#customDialogScrim.open').waitFor();
}
async function confirmDelete(page) {
  await page.locator('#customDialogConfirm').click();
  await page.waitForFunction(() => !providerDeletionBusy);
}
async function readChat(page) {
  await page.locator('#menuBtn').click();
  await page.locator('.studio-conv-open').filter({hasText: 'Existing readable chat'}).click();
  assert.match(await page.locator('#chatInner').innerText(), /Keep this question/);
  assert.match(await page.locator('#chatInner').innerText(), /Keep this answer and its artifact\./);
}
async function assertSuccessfulDelete(page, before, {last = false, shared = false, active = 'delete'} = {}) {
  const after = await snapshot(page);
  assert.deepEqual(after.db.providers.map(p => p.id), last ? [] : ['p-keep']);
  assert.deepEqual(unrelated(after.db), unrelated(before.db), 'all conversations, messages and unrelated settings survive');
  assert.deepEqual(after.db.parametersByModel, Object.fromEntries(
    Object.entries(before.db.parametersByModel).filter(([key]) => !key.startsWith('p-delete:'))));
  assert.deepEqual(after.stored, after.db, 'successful deletion is persisted');
  assert.equal(after.clears, 0, 'deleting one provider must never clearAll');
  assert.deepEqual(after.removes, shared ? [] : [deletedRef], 'remove uses the saved secretRef, not the provider ID');
  const expectedSecrets = {...before.secrets};
  if (!shared) delete expectedSecrets[deletedRef];
  assert.deepEqual(after.secrets, expectedSecrets, 'only the deleted provider secret can be removed');
  assert.equal(await page.locator('#provSheet').evaluate(n => n.classList.contains('open')), false);
  assert.equal(await page.locator('#setSheetTitle').innerText(), 'Providers');
  assert.equal(await page.locator('.provider-card').count(), last ? 0 : 1);
  const expectedMid = last ? null : active === 'keep' ? 'kept-chosen' : 'fallback-first';
  assert.equal(after.db.lastProviderId, last ? null : 'p-keep');
  assert.equal(after.db.lastModelId, expectedMid);
  assert.deepEqual(await page.evaluate(() => {
    const m = currentModel(); return m ? [m.provider.id, m.modelId] : null;
  }), last ? null : ['p-keep', expectedMid]);
  assert.equal(await page.locator('#providerName').innerText(), last ? 'Choose provider' : 'Kept provider');
  assert.equal(await page.locator('#modelName').innerText(), last ? 'Select a model' : active === 'keep' ? 'Kept Chosen' : 'Fallback First');
  return after;
}

(async () => {
  const browser = await launch();
  const failures = [];
  let passed = 0;
  try {
    async function test(name, options, run) {
      const context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
      const page = await context.newPage();
      page.setDefaultTimeout(4500);
      const errors = [], unexpectedRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route(/^https?:\/\//, route => {
        const url = route.request().url();
        // Mock the skill-pack and both updater sources. No live HTTP is allowed.
        if (/^https:\/\/(raw\.githubusercontent\.com|api\.github\.com)\//.test(url)) {
          return route.fulfill({status: 503, contentType: 'application/json', body: '{}'});
        }
        if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.abort();
        if (/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//.test(url)) {
          return route.fulfill({status: 200, contentType: url.endsWith('.css') ? 'text/css' : 'application/javascript', body: ''});
        }
        unexpectedRequests.push(url);
        return route.abort();
      });
      try {
        await page.addInitScript(seed => {
          if (window !== window.top) return;
          // Reload must exercise persisted deletion, never recreate the fixture.
          if (!sessionStorage.getItem('provider-delete-fixture-initialized')) {
            localStorage.setItem('nazchat_v1', JSON.stringify(seed));
            sessionStorage.setItem('provider-delete-fixture-initialized', '1');
            sessionStorage.setItem('provider-delete-native-secrets', '{}');
          }
          window.__KITA_NATIVE__ = false;
          // Only plain-text chat is needed here. Stub CDN renderers, not app logic.
          window.marked = {setOptions() {}, use() {}, parse(text) {
            const node = document.createElement('div'); node.textContent = text; return node.innerHTML;
          }};
          window.DOMPurify = {sanitize: html => html};
          window.renderMathInElement = () => {};
          const mock = window.secretMock = {
            values: JSON.parse(sessionStorage.getItem('provider-delete-native-secrets') || '{}'),
            puts: [], removes: [], gets: [], clears: 0, removeResult: true,
            persist() { sessionStorage.setItem('provider-delete-native-secrets', JSON.stringify(this.values)); }
          };
          window.NazSecrets = {
            get(ref) { mock.gets.push(ref); return ''; },
            has(ref) { return Object.prototype.hasOwnProperty.call(mock.values, ref); },
            put(ref, value) { mock.puts.push(ref); mock.values[ref] = value; mock.persist(); return true; },
            remove(ref) {
              mock.removes.push(ref);
              if (!mock.removeResult) return false;
              delete mock.values[ref]; mock.persist(); return true;
            },
            clearAll() { mock.clears++; mock.values = {}; mock.persist(); return true; }
          };
        }, fixture(options));
        await page.goto(appUrl, {waitUntil: 'domcontentloaded', timeout: 15000});
        assert.equal(await page.evaluate(() => HAS_NATIVE), false, 'native secrets must not enable native networking');
        assert.deepEqual(await page.evaluate(() => window.secretMock.puts),
          options.last ? [deletedRef] : [deletedRef, options.shared ? deletedRef : keptRef],
          'legacy fake API keys migrate through native put');
        assert(await page.evaluate(() => db.providers.every(p => !('apiKey' in p))));
        await readChat(page);
        await openProviders(page);
        await run(page);
        assert.deepEqual(errors, [], 'no browser runtime errors');
        assert.deepEqual(unexpectedRequests, [], 'no unexpected provider, MCP or remote calls');
        passed++;
        console.log('PASS ' + name);
      } catch (error) {
        failures.push(name);
        console.error('FAIL ' + name + '\n' + (error.stack || error));
      } finally {
        await context.close();
      }
    }

    await test('Add Provider has no Delete provider button', {}, async page => {
      await page.getByRole('button', {name: 'Add', exact: true}).click();
      assert.equal(await page.locator('#provFormTitle').innerText(), 'Add Provider');
      assert.equal(await page.locator('#deleteProviderBtn').count(), 0);
      assert.equal(await page.locator('#provForm').getByRole('button', {name: 'Delete provider', exact: true}).count(), 0);
    });

    await test('cancel preserves all state, escaped name and honest backup warning', {}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await askDelete(page);
      const message = await page.locator('#customDialogMessage').innerText();
      assert(message.includes(specialName), 'provider name is displayed as literal text');
      assert.match(message, /All conversations and messages will be kept\./);
      assert.match(message, /does not revoke the key at the provider or remove it from older exported backups\./);
      assert(!/[\u2013\u2014]/.test(message), 'confirmation copy has no long dashes');
      assert.equal(await page.locator('#customDialogMessage img').count(), 0);
      assert.equal(await page.locator('.provider-card img').count(), 0);
      assert.equal(await page.evaluate(() => !!window.deleteNameInjected), false);
      await page.locator('#customDialogCancel').click();
      await page.waitForFunction(() => !providerDeletionBusy);
      assert.deepEqual(await snapshot(page), before);
      assert(await page.locator('#deleteProviderBtn').isEnabled());
      assert(await page.locator('#provSheet').evaluate(n => n.classList.contains('open')));
    });

    await test('active provider deletion keeps workspace, removes correct secret and reloads safely', {}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await askDelete(page); await confirmDelete(page);
      const after = await assertSuccessfulDelete(page, before);
      await page.reload({waitUntil: 'domcontentloaded'});
      const reloaded = await snapshot(page);
      assert.deepEqual(reloaded.db, after.db);
      assert.deepEqual(reloaded.secrets, after.secrets);
      assert.deepEqual(await page.evaluate(() => window.secretMock.puts), [], 'reload does not reseed API keys');
      assert.equal(await page.evaluate(() => HAS_NATIVE), false);
      await readChat(page);
      assert.equal(await page.locator('#providerName').innerText(), 'Kept provider');
      await openProviders(page);
      assert.equal(await page.locator('.provider-card').count(), 1);
      assert.equal(await page.locator('.provider-card').filter({hasText: specialName}).count(), 0);
    });

    await test('non-active deletion preserves the active provider and non-first model', {active: 'keep'}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await askDelete(page); await confirmDelete(page);
      await assertSuccessfulDelete(page, before, {active: 'keep'});
    });

    await test('last provider deletion leaves empty provider UI and readable chat after reload', {last: true}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await askDelete(page); await confirmDelete(page);
      const after = await assertSuccessfulDelete(page, before, {last: true});
      assert.match(await page.locator('#provList').innerText(), /No providers connected yet\./);
      await page.locator('[data-close="setSheet"]').click();
      assert.match(await page.locator('#chatInner').innerText(), /Keep this question/);
      await page.reload({waitUntil: 'domcontentloaded'});
      assert.deepEqual((await snapshot(page)).db, after.db);
      assert.deepEqual((await snapshot(page)).secrets, {});
      await readChat(page);
      assert.equal(await page.locator('#modelName').innerText(), 'Select a model');
      await openProviders(page);
      assert.match(await page.locator('#provList').innerText(), /No providers connected yet\./);
    });

    for (const flag of ['generating', 'activeRun', 'steerHandoff']) {
      await test('deletion is blocked while ' + flag, {}, async page => {
        await editDeleted(page);
        const before = await snapshot(page);
        await page.evaluate(flag => {
          if (flag === 'generating') generating = true;
          if (flag === 'activeRun') activeRun = {fixture: true};
          if (flag === 'steerHandoff') steerHandoff = {fixture: true};
        }, flag);
        try {
          await page.locator('#deleteProviderBtn').click();
          await page.waitForFunction(() => !providerDeletionBusy);
          assert.equal(await page.locator('#customDialogScrim.open').count(), 0);
          assert.match(await page.locator('#toast').innerText(), /Stop the current response/);
          assert.deepEqual(await snapshot(page), before);
        } finally {
          await page.evaluate(() => { generating = false; activeRun = null; steerHandoff = null; });
        }
      });
    }

    await test('generation starting during confirmation blocks deletion', {}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await askDelete(page);
      await page.evaluate(() => { activeRun = {fixture: true}; });
      try {
        await confirmDelete(page);
        assert.deepEqual(await snapshot(page), before);
        assert.match(await page.locator('#toast').innerText(), /Stop the current response/);
      } finally { await page.evaluate(() => { activeRun = null; }); }
    });

    await test('failed save rolls back without removing native secret and allows retry', {}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await page.evaluate(() => { window.realProviderDeleteSave = save; save = () => false; });
      try {
        await askDelete(page); await confirmDelete(page);
        assert.deepEqual(await snapshot(page), before);
        assert.match(await page.locator('#toast').innerText(), /could not be saved/);
        assert(await page.locator('#deleteProviderBtn').isEnabled());
      } finally {
        await page.evaluate(() => { save = window.realProviderDeleteSave; delete window.realProviderDeleteSave; });
      }
      await askDelete(page); await confirmDelete(page);
      await assertSuccessfulDelete(page, before);
    });

    await test('native remove false rolls back persisted state and allows retry', {}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await page.evaluate(() => { window.secretMock.removeResult = false; });
      await askDelete(page); await confirmDelete(page);
      const rolledBack = await snapshot(page);
      assert.deepEqual(rolledBack.db, before.db);
      assert.deepEqual(rolledBack.stored, before.stored);
      assert.deepEqual(rolledBack.secrets, before.secrets);
      assert.deepEqual(rolledBack.removes, [deletedRef]);
      assert.equal(rolledBack.clears, 0);
      assert.match(await page.locator('#toast').innerText(), /saved key could not be removed/);
      assert(await page.locator('#deleteProviderBtn').isEnabled());
      await page.evaluate(() => { window.secretMock.removeResult = true; window.secretMock.removes = []; });
      await askDelete(page); await confirmDelete(page);
      await assertSuccessfulDelete(page, before);
    });

    await test('shared secretRef preserves the remaining provider secret', {shared: true}, async page => {
      await editDeleted(page);
      const before = await snapshot(page);
      await askDelete(page); await confirmDelete(page);
      await assertSuccessfulDelete(page, before, {shared: true});
      assert.equal(await page.evaluate(() => hasProviderSecret(db.providers[0])), true);
      assert.match(await page.locator('.provider-card').innerText(), /Key stored/);
    });

    console.log(`Provider deletion: ${passed} PASS, ${failures.length} FAIL`);
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
