import {
  SITE_PREFIX, SCRIPT_PREFIX, sanitizeSettings, validHostname,
  siteFromURL, siteKey, sitePattern, scriptId,
} from './settings.js';

// Event-driven MV3 worker: no polling, heartbeat, or permanent background page.
let changes = Promise.resolve();
const resources = new Map();
const pendingResources = new Map();
const MAX_RESOURCE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 4 * 1024 * 1024;
let cacheBytes = 0;

async function readSite(hostname) {
  const key = siteKey(hostname);
  return sanitizeSettings((await chrome.storage.local.get(key))[key]);
}

async function registerSite(hostname, enabled) {
  const id = scriptId(hostname);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!enabled) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
    return;
  }
  if (!existing.length) {
    await chrome.scripting.registerContentScripts([{
      id, matches: [sitePattern(hostname)], js: ['content.js'],
      allFrames: true, matchOriginAsFallback: true,
      runAt: 'document_start', world: 'ISOLATED', persistAcrossSessions: true,
    }]);
  }
}

async function updateOpenTabs(hostname, enabled) {
  const tabs = await chrome.tabs.query({ url: sitePattern(hostname) });
  const results = await Promise.allSettled(tabs.map(async tab => {
    if (!tab.id) return;
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'ADM_SYNC' });
      if (result?.ok) return;
    } catch { /* A newly enabled page has no content script yet. */ }
    if (enabled) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true }, files: ['content.js'],
        });
      } catch {
        // Restricted third-party frames must not prevent the main page from working.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      }
    }
  }));
  return results.filter(result => result.status === 'rejected').length;
}

async function saveSite(hostname, patch) {
  if (!validHostname(hostname)) throw new Error('Este endereço não pode ser personalizado.');
  const old = await readSite(hostname);
  const settings = sanitizeSettings({ ...old, ...patch });
  await registerSite(hostname, settings.enabled);
  try {
    await chrome.storage.local.set({ [siteKey(hostname)]: settings });
  } catch (error) {
    await registerSite(hostname, old.enabled);
    throw error;
  }
  const failedTabs = await updateOpenTabs(hostname, settings.enabled);
  return { settings, failedTabs };
}

async function restoreRegistrations() {
  const [stored, registered] = await Promise.all([
    chrome.storage.local.get(null), chrome.scripting.getRegisteredContentScripts(),
  ]);
  const active = Object.entries(stored)
    .filter(([key, value]) => key.startsWith(SITE_PREFIX) && value?.enabled)
    .map(([key]) => key.slice(SITE_PREFIX.length)).filter(validHostname);
  const wanted = new Set(active.map(scriptId));
  const stale = registered.filter(s => s.id.startsWith(SCRIPT_PREFIX) && !wanted.has(s.id));
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale.map(s => s.id) });
  for (const hostname of active) await registerSite(hostname, true);
  return active;
}

async function setBadge(tabId, status) {
  if (!Number.isInteger(tabId)) return;
  const label = status === 'native' ? 'SITE' : status === 'on' ? 'ON' : '';
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: label }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: status === 'native' ? '#48756b' : '#7461b8' }),
    chrome.action.setTitle({ tabId, title: label ? 'Always Dark — ativo neste site' : 'Always Dark — ativar neste site' }),
  ]).catch(() => {}); // The tab may close while a message is in flight.
}

function encodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(binary);
}

async function fetchResource(rawURL, sender) {
  const hostname = siteFromURL(sender.tab?.url);
  if (!hostname || !(await readSite(hostname)).enabled) throw new Error('Site não ativado.');
  const url = new URL(rawURL);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Recurso não permitido.');
  }
  // HTTP content on an HTTPS page remains subject to mixed-content restrictions.
  if (sender.tab.url.startsWith('https:') && url.protocol !== 'https:') {
    throw new Error('Recurso inseguro.');
  }
  const key = url.href;
  const cached = resources.get(key);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.value;
  if (pendingResources.has(key)) return pendingResources.get(key);
  const job = (async () => {
    const response = await fetch(key, {
      credentials: 'omit', cache: 'force-cache', redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Recurso indisponível.');
    const contentType = response.headers.get('content-type') || '';
    if (!/^(text\/css|image\/|application\/octet-stream)/i.test(contentType)) {
      throw new Error('O recurso não é uma imagem ou folha de estilos.');
    }
    if (Number(response.headers.get('content-length')) > MAX_RESOURCE_BYTES) throw new Error('Recurso muito grande.');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_RESOURCE_BYTES) { await reader.cancel(); throw new Error('Recurso muito grande.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = { body: encodeBytes(bytes), contentType };
    const size = value.body.length * 2;
    if (size <= MAX_CACHE_BYTES) {
      if (cached) { cacheBytes -= cached.size; resources.delete(key); }
      while (resources.size && (resources.size >= 24 || cacheBytes + size > MAX_CACHE_BYTES)) {
        const first = resources.keys().next().value;
        cacheBytes -= resources.get(first).size;
        resources.delete(first);
      }
      resources.set(key, { value, size, time: Date.now() });
      cacheBytes += size;
    }
    return value;
  })();
  pendingResources.set(key, job);
  try { return await job; } finally { pendingResources.delete(key); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const isPanel = sender.url === chrome.runtime.getURL('popup.html');
  let work;
  if (message?.type === 'ADM_SAVE' && isPanel) {
    work = changes.then(() => saveSite(message.hostname, message.patch));
    changes = work.catch(() => {});
  } else if (message?.type === 'ADM_REFRESH' && isPanel && validHostname(message.hostname)) {
    work = changes.then(async () => {
      const settings = await readSite(message.hostname);
      await registerSite(message.hostname, settings.enabled);
      const failedTabs = await updateOpenTabs(message.hostname, settings.enabled);
      return { settings, failedTabs };
    });
    changes = work.catch(() => {});
  } else if (message?.type === 'ADM_STATUS' && sender.tab && sender.frameId === 0) {
    work = setBadge(sender.tab.id, message.status).then(() => ({}));
  } else if (message?.type === 'ADM_FETCH' && sender.tab) {
    work = fetchResource(message.url, sender);
  } else if (message?.type === 'ADM_CONTRAST_STYLE' && sender.tab) {
    work = (async () => {
      const details = { target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, files: ['contrast.css'], origin: 'USER' };
      if (message.enabled === true) {
        const hostname = siteFromURL(sender.tab.url);
        if (!hostname || !(await readSite(hostname)).enabled) throw new Error('Site não ativado.');
        await chrome.scripting.insertCSS(details);
      } else await chrome.scripting.removeCSS(details);
      return {};
    })();
  } else if (message?.type === 'ADM_PROXY' && sender.tab) {
    work = (async () => {
      const hostname = siteFromURL(sender.tab.url);
      if (!hostname || !(await readSite(hostname)).enabled) throw new Error('Site não ativado.');
      await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
        files: ['proxy.js'], world: 'MAIN',
      });
      return {};
    })();
  } else return;
  work.then(value => respond({ ok: true, ...value }), error => respond({ ok: false, error: error.message }));
  return true;
});

const restore = (refreshTabs = false) => {
  changes = changes.then(async () => {
    const active = await restoreRegistrations();
    if (refreshTabs) for (const hostname of active) await updateOpenTabs(hostname, true);
  }).catch(error => console.error('Always Dark:', error.message));
};
chrome.runtime.onInstalled.addListener(() => restore(true));
chrome.runtime.onStartup.addListener(() => restore());
