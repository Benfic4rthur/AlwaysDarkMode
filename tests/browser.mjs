import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { luminance, contrastRatio } from '../src/settings.js';
import sharp from 'sharp';

// A separate temporary headless profile. Never connects to the user's profile.
const out = resolve('test-results');
await mkdir(out, { recursive: true });
const completed = [];
const pass = name => { completed.push(name); console.log(`✓ ${name}`); };
const css = `:root{--surface:#fff;--ink:#24272b}*{box-sizing:border-box}body{margin:0;background:#f0f2f6;color:#272a2e;font:16px/1.6 Arial}header{background:white;padding:22px 28px;border-bottom:1px solid #ddd}main{display:grid;grid-template-columns:220px 1fr;gap:24px;margin:24px}nav,article{background:var(--surface);color:var(--ink);padding:24px;border-radius:12px}h1{margin:0;font-size:26px}a{color:#bc5500}button{background:#da6100;color:#fff;border:0;padding:12px 20px;border-radius:6px;cursor:pointer}input,textarea,select{background:#fff;color:#222;border:1px solid #b9b9b9;padding:8px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd}tr:nth-child(even){background:#f5f5f5}.notice{background:#e2f3e6;color:#1f512e;padding:12px}.gradient{background:linear-gradient(90deg,#fff,#e4e9ee);color:#222;padding:12px}.pseudo::before{content:'Aviso';background:#fff4cf;color:#654a00;padding:5px}iframe{width:100%;height:100px;border:1px solid #ddd}#photo{width:200px;height:72px}canvas{width:100px;height:72px}`;
const picture = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="72"><rect width="200" height="72" fill="#87ceeb"/><circle cx="160" cy="20" r="13" fill="#ffd15c"/><path d="M0 72 60 15 110 72 150 35 200 72Z" fill="#347c59"/></svg>`;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64"><rect x="6" y="10" width="30" height="40" rx="4" fill="#ff7800"/><path d="M50 10h28v40H50ZM90 10h28v40H90ZM130 10h28v40h-28Z" fill="#50545a"/></svg>`;
const fixture = native => `<!doctype html><html lang="pt-BR" ${native ? 'class="native"' : ''}><head><meta charset="utf-8"><title>Ambiente de leitura</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="http://localhost:PORT/cdn.css"><style>html.native body,html.native article,html.native nav,html.native header{background:#12151a;color:#e5e5e5}</style></head><body><header><h1>Ambiente de leitura</h1></header><main><nav><strong>Trilha de aprendizagem</strong><p><a href="#lesson">Aula 01</a></p><p class="notice">Atividade concluída</p></nav><article id="lesson"><h2>Fundamentos da inteligência artificial</h2><p id="reading">Uma página clara, com textos, imagens e elementos interativos.</p><div class="gradient">Superfície com gradiente</div><p class="pseudo"></p><p class="cdn">Folha de estilos de outra origem</p><img id="photo" src="/photo.svg" alt="Paisagem de teste"><canvas id="canvas" width="100" height="72"></canvas><p><input id="input" aria-label="Resposta curta" placeholder="Escreva aqui"><select aria-label="Selecione"><option>Uma opção</option></select></p><textarea aria-label="Resposta longa">Texto digitado pelo aluno</textarea><p><button id="interactive" onclick="this.textContent='Funcionou'">Adicionar envio</button></p><table><tr><th>Atividade</th><th>Status</th></tr><tr><td>Aula 01</td><td>Concluída</td></tr><tr><td>Aula 02</td><td>Pendente</td></tr></table><iframe id="same-frame" src="/frame"></iframe><iframe id="blank-frame" srcdoc="<style>body{background:white;color:#222}</style><p>Documento incorporado</p>"></iframe><div id="shadow"></div><div id="dynamic"></div></article></main><script>const shadow=document.querySelector('#shadow').attachShadow({mode:'open'});shadow.innerHTML='<style>p{background:#fff;color:#222;padding:10px}</style><p>Componente com Shadow DOM</p>';const c=document.querySelector('canvas').getContext('2d');c.fillStyle='#e45555';c.fillRect(0,0,100,72);c.fillStyle='#4d8ede';c.fillRect(0,0,50,72);</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === '/stream') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<!doctype html><html><head><style>body,header,article{background:#fff;color:#222}</style></head><body><header>Conteúdo disponível</header><article>Leitura antes do fim do documento</article>' + '<!--' + ' '.repeat(4096) + '-->');
    setTimeout(() => res.end('</body></html>'), 1500);
    return;
  }
  if (req.url === '/styles.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end(css); }
  else if (req.url === '/cdn.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end('.cdn{background:#fdf0ea;color:#712e06;padding:12px}'); }
  else if (req.url === '/photo.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(picture); }
  else if (req.url?.endsWith('-logo.svg')) {
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    res.end(req.url === '/light-logo.svg' ? logo.replace('#50545a', '#eeeeee') : req.url === '/opaque-logo.svg'
      ? logo.replace('><rect', '><rect width="240" height="64" fill="white"/><rect') : logo);
  }
  else if (req.url === '/frame') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<style>body{background:white;color:#333;font:16px Arial}</style><p>Conteúdo da aula incorporado</p>'); }
  else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fixture(req.url === '/native').replace('http://localhost:PORT/cdn.css', 'https://assets.example.net/fixture.css')
      .replace('</h1>', '</h1><span id="low-contrast-badge" class="badge" style="display:inline-block;border-radius:30px;padding:5px 12px;background:#000!important;color:#181922!important">Tarefas: receber uma nota</span>')
      .replace('<h1>', '<img id="brand-logo" src="/brand-logo.svg" alt="Marca de teste" width="240" height="64"><img id="light-logo" src="/light-logo.svg" alt="Marca clara" width="240" height="64"><img id="opaque-logo" src="/opaque-logo.svg" alt="Marca opaca" width="240" height="64"><h1>'));
  }
});
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 1000 },
  args: [`--disable-extensions-except=${resolve('extension')}`, `--load-extension=${resolve('extension')}`],
});
await context.route('https://assets.example.net/fixture.css', route => route.fulfill({
  status: 200, contentType: 'text/css', body: '.cdn{background:#fdf0ea;color:#712e06;padding:12px}',
}));
const errors = [];
const diagnostic = [];
context.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') diagnostic.push(message.text());
});
context.on('weberror', error => errors.push(String(error.error())));
let panel;
let page;

const color = async (scope, selector, property = 'backgroundColor') => scope.locator(selector).first().evaluate((el, prop) => getComputedStyle(el)[prop], property);
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
const dark = async (scope, selector) => luminance(rgb(await color(scope, selector))) < 0.12;
async function waitFor(check, message) {
  for (let n = 0; n < 100; n++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).hostname;
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  assert.equal(await page.locator('style.darkreader').count(), 0);
  assert.equal((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 0);
  const original = await color(page, 'article');
  const box = await page.locator('article').boundingBox();
  const photo = await page.locator('#photo').screenshot();
  const canvas = await page.locator('#canvas').screenshot();
  const logoBefore = await page.locator('#brand-logo').screenshot();
  pass('desligada por padrão, sem scripts registrados ou CSS em páginas não ativadas');

  // Chromium headless does not expose toolbar popups as Playwright Pages.
  // Render the real packaged popup in a tab, supplying only the toolbar's
  // active-tab selection. Messaging, storage and scripting remain real APIs.
  const siteTabId = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, page.url());
  async function openPanel() {
    if (panel && !panel.isClosed()) await panel.close();
    panel = await context.newPage();
    await panel.addInitScript(tabId => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = options => options.active
        ? chrome.tabs.get(tabId).then(tab => [tab]) : query(options);
    }, siteTabId);
    await panel.goto(`chrome-extension://${extensionId}/popup.html`);
    await panel.locator('#toggle:not([disabled])').waitFor();
    return panel;
  }
  await openPanel();
  assert.equal(await panel.locator('#hostname').textContent(), '127.0.0.1');
  await panel.getByRole('switch').click();
  await page.bringToFront();
  await waitFor(() => dark(page, 'article'), 'O site não escureceu.');
  assert.equal(await panel.getByRole('switch').getAttribute('aria-checked'), 'true');
  assert.equal((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 1);
  await panel.screenshot({ path: resolve(out, 'painel.png') });
  await panel.locator('body').screenshot({ path: resolve(out, 'painel-closeup.png') });
  pass('painel empacotado ativa o hostname atual e registra somente esse site');

  const textContrast = contrastRatio(rgb(await color(page, 'article')), rgb(await color(page, '#reading', 'color')));
  assert.ok(textContrast >= 7, `Contraste ${textContrast}`);
  const newBox = await page.locator('article').boundingBox();
  assert.ok(Math.abs(box.width - newBox.width) < 1 && Math.abs(box.height - newBox.height) < 1);
  async function comparePixels(selector, before) {
    const after = await page.locator(selector).screenshot();
    // Fractional element positions include a row of the parent's background in
    // the screenshot. Compare actual image pixels inside that one-pixel edge.
    const { width, height } = await sharp(before).metadata();
    const crop = { left: 1, top: 1, width: width - 2, height: height - 2 };
    const a = await sharp(before).extract(crop).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(after).extract(crop).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(a.info, b.info);
    let different = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) different++;
    if (different) {
      console.log('Image diagnostic', selector, different, a.data.length,
        await page.locator(selector).evaluate(el => ({ filter: getComputedStyle(el).filter, box: el.getBoundingClientRect().toJSON() })));
      await writeFile(resolve(out, `${selector.slice(1)}-before.png`), before);
      await writeFile(resolve(out, `${selector.slice(1)}-after.png`), after);
    }
    assert.equal(different, 0, `Pixels alterados em ${selector}`);
  }
  await comparePixels('#photo', photo);
  await comparePixels('#canvas', canvas);
  pass(`texto com contraste ${textContrast.toFixed(2)}:1, geometria e pixels de imagem/canvas preservados`);

  await waitFor(async () => await page.locator('#brand-logo').getAttribute('data-adm-readable') === 'true', 'O logo escuro não ganhou contraste.');
  const logoAfter = await page.locator('#brand-logo').screenshot();
  const sample = async (buffer, x, y) => Array.from(await sharp(buffer).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer());
  assert.deepEqual(await sample(logoAfter, 15, 25), await sample(logoBefore, 15, 25), 'A cor laranja da marca deve permanecer igual.');
  const grayAfter = await sample(logoAfter, 60, 25);
  assert.ok(Math.min(...grayAfter) > 160, `Traços escuros não foram clareados: ${grayAfter}`);
  assert.equal(await page.locator('#light-logo').getAttribute('data-adm-readable'), null);
  assert.equal(await page.locator('#opaque-logo').getAttribute('data-adm-readable'), null);
  pass('contraste genérico de logos: letras clareadas, laranja idêntico, logos claros/opacos preservados');

  await page.evaluate(() => {
    const holder = document.createElement('div'); holder.id = 'late-brand';
    holder.innerHTML = '<img alt="Logo de carregamento tardio" src="/brand-logo.svg" width="240" height="64">';
    const sheet = document.createElement('style'); sheet.id = 'late-brand-style';
    sheet.textContent = '#late-brand{background:white!important}';
    document.head.append(sheet); document.querySelector('header').append(holder);
  });
  await page.locator('#late-brand img').evaluate(image => image.decode());
  assert.equal(await page.locator('#late-brand img').getAttribute('data-adm-readable'), null);
  await page.evaluate(() => document.querySelector('#late-brand-style').sheet.insertRule('#late-brand{background:#000!important}', 1));
  await waitFor(async () => await page.locator('#late-brand img').getAttribute('data-adm-readable') === 'true', 'O logo não foi reavaliado após a mudança da folha de estilos.');
  pass('logo é reavaliado após CSS tardio, sem regras específicas por site');


  await waitFor(() => dark(page, 'input'), 'O campo não escureceu.');
  assert.ok(contrastRatio(rgb(await color(page, 'input')), rgb(await color(page, 'input', 'color'))) >= 4.5);
  assert.equal(await page.locator('textarea').inputValue(), 'Texto digitado pelo aluno');
  await page.locator('#interactive').click();
  assert.equal(await page.locator('#interactive').textContent(), 'Funcionou');
  assert.ok(await dark(page, 'tr:nth-child(2)'));
  await waitFor(() => dark(page, '.cdn'), 'CSS de outra origem não adaptado.');
  pass('formulários, botões, tabelas e CSS externo continuam utilizáveis');

  await waitFor(async () => contrastRatio(rgb(await color(page, '#low-contrast-badge')), rgb(await color(page, '#low-contrast-badge', 'color'))) >= 4.5, 'O selo com texto escuro continuou ilegível.');
  assert.equal(await page.locator('#low-contrast-badge').getAttribute('data-adm-contrast'), 'true');
  pass('rótulo escuro sobre preto recebe contraste legível, inclusive com estilos !important');

  const sameFrame = page.frame({ url: `http://127.0.0.1:${port}/frame` });
  const blankFrame = page.frames().find(f => f.url() === 'about:srcdoc');
  await waitFor(() => dark(sameFrame, 'body'), 'O iframe do site não escureceu.');
  await waitFor(() => dark(blankFrame, 'body'), 'O iframe srcdoc não escureceu.');
  await waitFor(() => dark(page, '#shadow p'), 'Shadow DOM não escureceu.');
  await page.evaluate(() => {
    const el = document.createElement('section');
    el.id = 'late'; el.style.cssText = 'background:#ffffff;color:#222;padding:10px';
    el.textContent = 'Conteúdo adicionado depois'; document.querySelector('#dynamic').append(el);
  });
  await waitFor(() => dark(page, '#late'), 'Conteúdo dinâmico não escureceu.');
  await page.evaluate(() => {
    document.styleSheets[0].insertRule('.cssom-dynamic{background:#fff;color:#111}', 0);
    const el = document.createElement('p'); el.className = 'cssom-dynamic'; el.textContent = 'Regra criada por JavaScript';
    document.querySelector('#dynamic').append(el);
    const sheet = new CSSStyleSheet(); sheet.replaceSync('.adopted{background:#fff;color:#111}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const adopted = document.createElement('p'); adopted.className = 'adopted'; adopted.textContent = 'Folha de estilo adotada';
    document.querySelector('#dynamic').append(adopted);
  });
  await waitFor(() => dark(page, '.cssom-dynamic'), 'Regra CSSOM dinâmica não escureceu.');
  await waitFor(() => dark(page, '.adopted'), 'Folha de estilo adotada não escureceu.');
  pass('iframes do site, srcdoc, Shadow DOM e conteúdo dinâmico recebem o tema');

  // A registered document-start bundle can initialize while its tab is hidden.
  // Reveal it with only visibilitychange: no focus/resize may be needed to finish.
  const revealed = await context.newPage();
  await revealed.goto(`http://localhost:${port}/background`);
  const revealedId = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, revealed.url());
  await worker.evaluate(async id => {
    await chrome.storage.local.set({ 'site:localhost': { enabled: true } });
    // Use the actual extension's isolated world, where document-start runs.
    await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
      globalThis.fixtureHidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => globalThis.fixtureHidden });
      for (const event of ['focus', 'pageshow']) window.addEventListener(event, e => e.stopImmediatePropagation(), true);
    } });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
  }, revealedId);
  await waitFor(async () => (await worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'ADM_GET_STATUS' }), revealedId)).status === 'waiting', 'O script não aguardou a aba oculta.');
  assert.equal(await revealed.locator('style.darkreader--sync').count(), 0);
  const revealStarted = performance.now();
  await worker.evaluate(id => chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
    globalThis.fixtureHidden = false; document.dispatchEvent(new Event('visibilitychange'));
  } }), revealedId);
  await waitFor(() => dark(revealed, 'header'), 'A aba revelada ficou com cabeçalho branco até receber foco.');
  await waitFor(() => dark(revealed, 'article'), 'A aba revelada ficou com o tema parcial.');
  const revealMs = performance.now() - revealStarted;
  pass(`aba oculta termina o tema ao aparecer, sem outro foco ou resize (${Math.round(revealMs)} ms)`);
  await worker.evaluate(() => chrome.storage.local.remove('site:localhost'));
  await revealed.close();
  const streamed = await context.newPage();
  await streamed.addInitScript(() => {
    window.fixtureThemeTiming = {};
    document.addEventListener('DOMContentLoaded', () => { window.fixtureThemeTiming.ready = performance.now(); });
    function sample() {
      const header = document.querySelector('header');
      if (header && getComputedStyle(header).backgroundColor !== 'rgb(255, 255, 255)') {
        window.fixtureThemeTiming.dark = performance.now(); return;
      }
      if (!window.fixtureThemeTiming.ready) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await streamed.bringToFront();
  const streamStarted = performance.now();
  await streamed.goto(`http://127.0.0.1:${port}/stream`, { waitUntil: 'commit' });
  await waitFor(() => dark(streamed, 'header'), 'O cabeçalho esperou o documento inteiro carregar.');
  const streamTiming = await streamed.evaluate(() => window.fixtureThemeTiming);
  assert.ok(streamTiming.dark && (!streamTiming.ready || streamTiming.dark < streamTiming.ready), 'O tema esperou DOMContentLoaded.');
  const firstThemeMs = performance.now() - streamStarted;
  pass(`tema inicia antes de DOMContentLoaded (${Math.round(firstThemeMs)} ms no teste local)`);
  await streamed.close();
  await page.screenshot({ path: resolve(out, 'pagina-escura.png'), fullPage: true });

  await openPanel();
  await panel.getByRole('button', { name: 'Preto', exact: true }).click();
  await panel.locator('#warmth').fill('15');
  await panel.locator('#warmth').dispatchEvent('change');
  await waitFor(async () => {
    const stored = await worker.evaluate(() => chrome.storage.local.get('site:127.0.0.1'));
    return stored['site:127.0.0.1']?.warmth === 15 && stored['site:127.0.0.1']?.preset === 'black';
  }, 'Os ajustes não foram salvos.');
  await panel.close();
  await page.reload();
  await waitFor(() => dark(page, 'article'), 'O tema não persistiu ao recarregar.');
  await openPanel();
  assert.equal(await panel.locator('#warmth').inputValue(), '15');
  assert.equal(await panel.getByRole('button', { name: 'Preto', exact: true }).getAttribute('aria-pressed'), 'true');
  await panel.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await panel.getByRole('switch').click();
  await page.bringToFront();
  await openPanel();
  await waitFor(async () => await color(page, 'article') === original, 'As cores originais não foram restauradas.');
  await waitFor(async () => await page.locator('style.darkreader').count() === 0, 'Os estilos não foram removidos.');
  assert.equal(await page.locator('style.darkreader').count(), 0);
  assert.equal(await page.locator('[data-adm-readable]').count(), 0);
  assert.equal(await page.locator('[data-adm-contrast]').count(), 0);
  assert.equal(await color(page, '#low-contrast-badge', 'color'), 'rgb(24, 25, 34)');
  assert.equal((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 0);
  pass('ajustes persistem ao recarregar; desligar restaura o site e remove o registro');

  await panel.close();
  await page.goto(`http://127.0.0.1:${port}/native`);
  await openPanel();
  await panel.getByRole('switch').click();
  await page.bringToFront();
  await openPanel();
  await waitFor(async () => await panel.locator('#status').textContent() === 'Tema do site', 'Tema escuro nativo não detectado.');
  assert.equal(await page.locator('style.darkreader').count(), 0);
  await page.evaluate(() => document.documentElement.classList.remove('native'));
  await waitFor(() => dark(page, 'article'), 'A mudança para tema claro não foi detectada.');
  pass('tema escuro nativo é preservado e mudança de tema é detectada');

  const other = await context.newPage();
  await other.goto(`http://localhost:${port}/`);
  assert.equal(await other.locator('style.darkreader').count(), 0);
  assert.equal(await color(other, 'article'), original);
  await other.close();
  pass('outro hostname permanece intocado');

  await page.bringToFront();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.evaluate(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 2000; i++) {
      const el = document.createElement('p'); el.textContent = `Parágrafo ${i}`; fragment.append(el);
    }
    document.querySelector('#dynamic').append(fragment);
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const before = await metrics();
  await new Promise(resolve => setTimeout(resolve, 1200));
  const after = await metrics();
  const idleScriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;
  assert.ok(idleScriptMs < 80, `Trabalho excessivo em repouso: ${idleScriptMs.toFixed(1)} ms`);
  pass(`página com 2.000 parágrafos: ${idleScriptMs.toFixed(2)} ms de JavaScript em 1,2 s de repouso`);

  assert.deepEqual(errors, []);
  pass('nenhuma exceção JavaScript no fluxo completo');
  await writeFile(resolve(out, 'verification.json'), JSON.stringify({ completed, textContrast, idleScriptMs }, null, 2));
  console.log(`\n${completed.length} verificações de navegador concluídas.`);
} catch (error) {
  console.error('Browser diagnostics:', diagnostic.slice(-12));
  if (page && !page.isClosed()) console.error(await page.evaluate(() => Array.from(document.querySelectorAll('style.darkreader--sync')).map(s => ({ css: s.sheet ? Array.from(s.sheet.cssRules, r => r.cssText).join('').slice(0,120) : '', previous: s.previousElementSibling?.outerHTML.slice(0,200) }))));
  if (page && !page.isClosed()) console.error(await page.evaluate(() => Array.from(document.querySelectorAll('style.darkreader'), s => s.outerHTML.slice(0,200))));
  if (page && !page.isClosed()) console.error('Including shadow roots:', await page.locator('style.darkreader').evaluateAll(nodes => nodes.map(s => s.outerHTML.slice(0,200))));
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await context.close();
  await new Promise(resolve => server.close(resolve));
}
