import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, sanitizeSettings, siteFromURL, validHostname, scriptId, engineTheme, contrastRatio } from '../src/settings.js';
import { needsImageContrast } from '../src/image-contrast.js';

test('configuração ausente ou corrompida mantém a extensão desligada', () => {
  for (const value of [undefined, null, [], 'invalid', 42]) assert.deepEqual(sanitizeSettings(value), DEFAULTS);
  assert.equal(sanitizeSettings({ enabled: 'true', preserveNative: 'false' }).enabled, false);
});

test('valores de cores ficam em limites válidos e campos estranhos são descartados', () => {
  assert.deepEqual(sanitizeSettings({
    enabled: true, preset: '__proto__', brightness: Infinity, contrast: -50,
    warmth: 1000, preserveNative: false, extra: 'ignored',
  }), { enabled: true, preset: 'dark', brightness: 100, contrast: 80, warmth: 50, preserveNative: false });
  assert.equal(sanitizeSettings({ brightness: 101.7 }).brightness, 102);
});

test('URLs protegidas, inválidas e esquemas especiais não são ativados', () => {
  for (const url of ['edge://settings', 'file:///tmp/a.html', 'data:text/html,hello', 'not a URL',
    'https://chromewebstore.google.com/detail/x', 'https://microsoftedge.microsoft.com/addons/detail/x']) {
    assert.equal(siteFromURL(url), null);
  }
  assert.equal(siteFromURL('https://www.eadunifatecie.com.br/mod/assign/view.php?id=1'), 'www.eadunifatecie.com.br');
  assert.equal(siteFromURL('http://localhost:8080/a'), 'localhost');
  assert.equal(siteFromURL('https://münchen.de'), 'xn--mnchen-3ya.de');
});

test('escopo de site é hostname exato, sem caminho, credencial ou wildcard', () => {
  for (const invalid of ['*.example.com', 'example.com/a', 'user@example.com', 'EXAMPLE.COM', '', 'example.com:8000', 'https://example.com']) {
    assert.equal(validHostname(invalid), false, invalid);
  }
  for (const valid of ['example.com', 'www.example.com', 'localhost', '127.0.0.1', '[::1]', 'xn--mnchen-3ya.de']) assert.equal(validHostname(valid), true, valid);
  assert.notEqual(scriptId('a-b.com'), scriptId('ab.com'));
});

test('tons padrão oferecem contraste de leitura alto e mantém opções de cor', () => {
  const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
  for (const preset of ['soft', 'dark', 'black']) {
    const theme = engineTheme({ preset });
    assert.ok(contrastRatio(rgb(theme.darkSchemeBackgroundColor), rgb(theme.darkSchemeTextColor)) > 10);
    assert.equal(theme.mode, 1);
    assert.equal(theme.grayscale, 0);
  }
});

test('reconhece letras escuras transparentes; preserva imagens opacas, logos claros e coloridos', () => {
  const pixels = (...colors) => new Uint8ClampedArray(colors.flatMap(c => Array.from({ length: 20 }, () => c).flat()));
  assert.equal(needsImageContrast(pixels([70, 75, 78, 255], [255, 110, 0, 255], [0, 0, 0, 0])), true);
  assert.equal(needsImageContrast(pixels([70, 75, 78, 255], [255, 110, 0, 255])), false);
  assert.equal(needsImageContrast(pixels([230, 230, 230, 255], [0, 0, 0, 0])), false);
  assert.equal(needsImageContrast(pixels([255, 110, 0, 255], [0, 0, 0, 0])), false);
});
