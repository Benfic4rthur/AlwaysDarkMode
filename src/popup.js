import { DEFAULTS, siteFromURL, siteKey, sanitizeSettings } from './settings.js';

const $ = selector => document.querySelector(selector);
const controls = ['brightness', 'contrast', 'warmth'];
let hostname;
let settings = sanitizeSettings();
let pending = {};
let timer;
let saving = false;
let currentTab;
let appliedStatus;

function feedback(message = '', error = false) {
  $('#feedback').textContent = message;
  $('#feedback').classList.toggle('error', error);
}

function render(status = appliedStatus) {
  appliedStatus = status;
  $('#toggle').setAttribute('aria-checked', String(settings.enabled));
  $('#toggle').setAttribute('aria-label', `${settings.enabled ? 'Desativar' : 'Ativar'} modo escuro neste site`);
  const label = !hostname ? 'Indisponível' : !settings.enabled ? 'Desligado'
    : status === 'native' ? 'Tema do site' : status === 'on' ? 'Ativado'
    : status === 'error' || status === 'off' ? 'Não aplicado'
    : status === 'waiting' ? 'Aguardando aba' : 'Aplicando…';
  $('#status').textContent = label;
  $('#status').classList.toggle('on', Boolean(hostname && settings.enabled && ['on', 'native'].includes(status)));
  $('#site-description').textContent = settings.enabled ? 'Modo escuro salvo para este site' : 'Ative para uma leitura confortável';
  for (const name of controls) {
    const input = $(`#${name}`);
    input.value = settings[name];
    $(`#${name}-value`).value = `${settings[name]}%`;
    input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
  }
  for (const button of document.querySelectorAll('[data-preset]')) {
    const selected = button.dataset.preset === settings.preset;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('#preserveNative').checked = settings.preserveNative;
}

async function updateStatus() {
  if (!currentTab?.id || !settings.enabled) return;
  try {
    const result = await chrome.tabs.sendMessage(currentTab.id, { type: 'ADM_GET_STATUS' }, { frameId: 0 });
    render(result?.status);
    if (['error', 'off'].includes(result?.status)) feedback('O tema não foi aplicado. Recarregue a página.', true);
  } catch {
    render('error');
    feedback('O tema não foi aplicado. Recarregue a página.', true);
  }
}

async function flush() {
  clearTimeout(timer);
  if (saving || !Object.keys(pending).length || !hostname) return;
  saving = true;
  const patch = pending;
  pending = {};
  try {
    const result = await chrome.runtime.sendMessage({ type: 'ADM_SAVE', hostname, patch });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível salvar.');
    if (result.failedTabs) {
      feedback('Ajuste salvo. Recarregue a página para aplicar.', true);
    } else {
      feedback();
    }
    if (!Object.keys(pending).length) {
      settings = sanitizeSettings(result.settings);
      render();
      await updateStatus();
    }
  } catch (error) {
    feedback(error.message, true);
    const stored = await chrome.storage.local.get(siteKey(hostname));
    settings = { ...sanitizeSettings(stored[siteKey(hostname)]), ...pending };
    render();
  } finally {
    saving = false;
    if (Object.keys(pending).length) void flush();
  }
}

function change(patch, immediate = true) {
  if (typeof patch.enabled === 'boolean' && patch.enabled !== settings.enabled) appliedStatus = undefined;
  settings = sanitizeSettings({ ...settings, ...patch });
  pending = { ...pending, ...patch };
  render();
  clearTimeout(timer);
  if (immediate) void flush();
  else timer = setTimeout(flush, 140);
}

$('#toggle').addEventListener('click', () => change({ enabled: !settings.enabled }));
for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => change({ preset: button.dataset.preset }));
}
for (const name of controls) {
  $(`#${name}`).addEventListener('input', event => change({ [name]: Number(event.target.value) }, false));
  $(`#${name}`).addEventListener('change', () => void flush());
  $(`#${name}`).addEventListener('blur', () => void flush());
}
$('#preserveNative').addEventListener('change', event => change({ preserveNative: event.target.checked }));
$('#reset').addEventListener('click', () => change({ ...DEFAULTS, enabled: settings.enabled }));
// Commit a final slider position even if the user immediately closes the panel.
window.addEventListener('pagehide', () => {
  clearTimeout(timer);
  if (!hostname || !Object.keys(pending).length) return;
  // The worker serializes this final patch even if an earlier save is in flight.
  chrome.runtime.sendMessage({ type: 'ADM_SAVE', hostname, patch: pending }).catch(() => {});
  pending = {};
});

async function initialize() {
  try {
    [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    hostname = siteFromURL(currentTab?.url);
    for (const control of document.querySelectorAll('button,input')) control.disabled = !hostname;
    if (!hostname) {
      $('#hostname').textContent = 'Página protegida pelo Edge';
      $('#saved-note').textContent = 'Abra um site comum para ativar o modo escuro.';
      render();
      $('#site-description').textContent = 'O Edge não permite alterar esta página';
      return;
    }
    $('#hostname').textContent = hostname.replace(/^www\./, '');
    $('#hostname').title = hostname;
    const stored = await chrome.storage.local.get(siteKey(hostname));
    settings = sanitizeSettings(stored[siteKey(hostname)]);
    render();
    if (settings.enabled) {
      await chrome.runtime.sendMessage({ type: 'ADM_REFRESH', hostname });
    }
    await updateStatus();
  } catch {
    feedback('Não foi possível ler esta guia. Reabra o painel.', true);
  }
}
void initialize();
