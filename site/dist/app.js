const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const demo = $('#browser-demo');
const toggle = $('#demo-toggle');
let dark = true;
let tone = 'dark';
let browser = 'edge';
let copyReset;

const palettes = {
  soft: { background: [37, 38, 49], surface: [45, 46, 59], text: [229, 226, 238] },
  dark: { background: [25, 25, 34], surface: [32, 32, 43], text: [230, 227, 239] },
  black: { background: [10, 11, 15], surface: [19, 20, 27], text: [229, 229, 235] },
};

function updateDemo() {
  demo.dataset.mode = dark ? 'dark' : 'light';
  demo.dataset.tone = tone;
  toggle.setAttribute('aria-checked', String(dark));
  $('#demo-status').innerHTML = `<i></i>${dark ? 'Ativado' : 'Desligado'}`;
  const brightness = Number($('#demo-brightness').value);
  $('#demo-brightness-value').value = `${brightness}%`;
  $('#demo-brightness').style.setProperty('--fill', `${(brightness - 80) / 40 * 100}%`);
  const palette = palettes[tone];
  for (const property of ['background', 'surface', 'text']) {
    const value = palette[property].map(channel => Math.min(255, Math.round(channel * brightness / 100)));
    demo.style.setProperty(`--demo-${property}`, `rgb(${value.join(' ')})`);
  }
  for (const button of $$('[data-tone]')) {
    const selected = button.dataset.tone === tone;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('selected', selected);
  }
}

toggle.addEventListener('click', () => { dark = !dark; updateDemo(); });
for (const button of $$('.tone-options [data-tone]')) {
  button.addEventListener('click', () => { tone = button.dataset.tone; dark = true; updateDemo(); });
}
$('#demo-brightness').addEventListener('input', updateDemo);

function setBrowser(next) {
  browser = next;
  for (const button of $$('[data-browser]')) button.setAttribute('aria-pressed', String(button.dataset.browser === browser));
  for (const address of $$('[data-browser-address]')) address.textContent = `${browser}://extensions`;
  for (const label of $$('[data-load-label]')) label.textContent = browser === 'edge' ? 'Carregar sem pacote' : 'Carregar sem compactação';
  for (const label of $$('[data-copy-address] span')) label.textContent = 'Copiar';
}
for (const button of $$('[data-browser]')) button.addEventListener('click', () => setBrowser(button.dataset.browser));
for (const button of $$('[data-copy-address]')) {
  button.addEventListener('click', async () => {
    const address = `${browser}://extensions`;
    try {
      await navigator.clipboard.writeText(address);
      for (const label of $$('[data-copy-address] span')) label.textContent = 'Copiado';
      $('#live-message').textContent = `Endereço ${address} copiado.`;
      clearTimeout(copyReset);
      copyReset = setTimeout(() => { for (const label of $$('[data-copy-address] span')) label.textContent = 'Copiar'; }, 2500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(button.previousElementSibling);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      $('#live-message').textContent = 'Selecione e copie o endereço com o atalho do seu teclado.';
    }
  });
}

const dialog = $('#download-dialog');
for (const link of $$('[data-download]')) {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Leave the native download intact; the dialog only explains installation.
    if (!dialog.open) dialog.showModal();
  });
}
$('[data-close-dialog]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});

async function loadRelease() {
  try {
    const response = await fetch('assets/release.json');
    if (!response.ok) return;
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^Always-Dark-[\d.]+\.zip$/.test(release.filename)) return;
    for (const label of $$('[data-version]')) label.textContent = `v${release.version}`;
    for (const label of $$('[data-package-size]')) label.textContent = `${Math.ceil(release.bytes / 1024)} KB`;
    for (const label of $$('[data-installed-size]')) label.innerHTML = `${Math.round(release.installedBytes / 1024)}<span>KB</span>`;
    for (const link of $$('a[download]')) link.href = `downloads/${release.filename}`;
  } catch { /* The included package and its printed version remain usable offline. */ }
}
updateDemo();
void loadRelease();

// This exists only on the local preview server. No GitHub calls or polling.
if (['127.0.0.1', 'localhost'].includes(location.hostname) && typeof EventSource === 'function') {
  const updates = new EventSource('/__reload');
  updates.addEventListener('refresh', () => location.reload());
  window.addEventListener('pagehide', () => updates.close(), { once: true });
}
