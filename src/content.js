import * as DarkReader from 'darkreader';
import { siteKey, sanitizeSettings, engineTheme, luminance, contrastRatio } from './settings.js';
import { ImageContrast } from './image-contrast.js';
import { ContrastGuard } from './contrast-guard.js';

// The build wraps this entire module in a guard, including the color engine.
const hostname = (() => {
  try {
    if (['about:', 'blob:', 'data:'].includes(location.protocol)) {
      return new URL(document.referrer || location.ancestorOrigins?.[0]).hostname;
    }
    return location.hostname;
  } catch { return location.hostname; }
})();
const key = siteKey(hostname);
const extensionRuntime = chrome.runtime;
let options = sanitizeSettings();
let status = 'off';
let lastTheme = '';
let generation = 0;
let frame = 0;
let nativeObserver;
let proxyReady;
const imageContrast = new ImageContrast(fetchPageResource);
const contrastGuard = new ContrastGuard(async enabled => {
  const response = await chrome.runtime.sendMessage({ type: 'ADM_CONTRAST_STYLE', enabled });
  if (!response?.ok) throw new Error('Estilo indisponível.');
});

function parseRGB(value) {
  const values = value.match(/[\d.]+/g)?.map(Number);
  if (!values || values.length < 3) return null;
  if (values.length > 3 && values[3] < 0.8) return null;
  return values.slice(0, 3);
}

function nativeDarkTheme() {
  if (!document.body) return false;
  if (document.querySelector('meta[name="darkreader"]')) return false;
  // Sample actual content surfaces; color-scheme alone is not evidence of a dark page.
  const nodes = [document.body, document.documentElement,
    document.querySelector('main, [role="main"], #page-content, #content')].filter(Boolean);
  let dark = 0, light = 0;
  for (const node of nodes) {
    const style = getComputedStyle(node);
    const background = parseRGB(style.backgroundColor);
    const foreground = parseRGB(style.color);
    if (!background) continue;
    if (luminance(background) > 0.35) light++;
    if (foreground && luminance(background) < 0.08 && contrastRatio(background, foreground) >= 4.5) dark++;
  }
  return dark > 0 && light === 0;
}

function announce(next) {
  status = next;
  if (window !== window.top) return;
  try { chrome.runtime.sendMessage({ type: 'ADM_STATUS', status }).catch(() => {}); }
  catch { /* A former content context can be invalidated during extension updates. */ }
}

function stop() {
  imageContrast.stop();
  contrastGuard.stop();
  if (DarkReader.isEnabled()) DarkReader.disable();
  document.dispatchEvent(new CustomEvent('__darkreader__cleanUp'));
  lastTheme = '';
  cancelAnimationFrame(frame);
  nativeObserver?.disconnect();
  nativeObserver = undefined;
}

async function apply() {
  const revision = ++generation;
  if (!options.enabled) { stop(); announce('off'); return; }
  // Background tabs are themed when first shown; no work is scheduled repeatedly.
  if (document.hidden && !DarkReader.isEnabled()) { announce('waiting'); return; }
  if (options.preserveNative && !DarkReader.isEnabled()) {
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    if (revision !== generation || !options.enabled) return;
    if (nativeDarkTheme()) {
      imageContrast.start();
      await contrastGuard.start();
      announce('native');
      if (!nativeObserver) {
        nativeObserver = new MutationObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(updateTheme);
        });
        for (const node of [document.documentElement, document.body]) {
          nativeObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'] });
        }
      }
      return;
    }
  }
  nativeObserver?.disconnect();
  nativeObserver = undefined;
  const theme = engineTheme(options);
  const serialized = JSON.stringify(theme);
  if (serialized !== lastTheme || !DarkReader.isEnabled()) {
    if (!DarkReader.isEnabled()) {
      proxyReady ||= chrome.runtime.sendMessage({ type: 'ADM_PROXY' }).finally(() => { proxyReady = null; });
      const proxy = await proxyReady;
      if (!proxy?.ok) throw new Error('Não foi possível preparar o tema.');
      if (revision !== generation || !options.enabled) {
        if (!options.enabled) document.dispatchEvent(new CustomEvent('__darkreader__cleanUp'));
        return;
      }
    }
    DarkReader.enable(theme, {
      disableStyleSheetsProxy: true,
      ignoreImageAnalysis: ['video', 'canvas'],
    });
    lastTheme = serialized;
  }
  imageContrast.start();
  await contrastGuard.start();
  announce('on');
}

async function sync() {
  try {
    const stored = await chrome.storage.local.get(key);
    acceptOptions(stored[key]);
    await apply();
    return { ok: true, status };
  } catch {
    stop();
    announce(options.enabled ? 'error' : 'off');
    return { ok: false, status };
  }
}

function updateTheme() {
  void apply().catch(() => { stop(); announce('error'); });
}

function acceptOptions(value) {
  const next = sanitizeSettings(value);
  if (next.preserveNative !== options.preserveNative) stop();
  options = next;
}

async function fetchPageResource(input) {
  const url = new URL(input, location.href);
  if (url.origin === location.origin || ['data:', 'blob:'].includes(url.protocol)) {
    const response = await fetch(url.href, { credentials: 'same-origin', cache: 'force-cache', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Recurso indisponível.');
    return response;
  }
  const result = await chrome.runtime.sendMessage({ type: 'ADM_FETCH', url: url.href });
  if (!result?.ok) throw new Error(result?.error || 'Recurso indisponível.');
  const bytes = Uint8Array.from(atob(result.body), character => character.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': result.contentType } });
}
DarkReader.setFetchMethod(fetchPageResource);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'ADM_SYNC') {
    sync().then(respond);
    return true;
  }
  if (message?.type === 'ADM_GET_STATUS') respond({ ok: true, status });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[key]) return;
  acceptOptions(changes[key].newValue);
  updateTheme();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && options.enabled) updateTheme();
});
window.addEventListener('pageshow', event => { if (event.persisted) void sync(); });
window.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
globalThis.__ADM__ = {
  sync,
  alive: () => Boolean(extensionRuntime.id),
  dispose: () => { options.enabled = false; generation++; stop(); },
};
void sync();
