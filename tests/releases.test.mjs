import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease, fetchLatestRelease } from '../site/dist/releases.js';

const release = (version = '1.0.1') => ({ tag_name: `v${version}`, draft: false, prerelease: false,
  assets: [{ name: 'Always-Dark.zip', state: 'uploaded', size: 66614,
    browser_download_url: `https://github.com/Benfic4rthur/AlwaysDarkMode/releases/download/v${version}/Always-Dark.zip` }] });

test('o número exibido vem da release oficial, inclusive em versões futuras', () => {
  assert.deepEqual(parseRelease(release()), { version: '1.0.1', bytes: 66614 });
  assert.equal(parseRelease(release('2.3.4')).version, '2.3.4');
});
test('não apresenta rascunho, pré-release ou versão sem o ZIP oficial', () => {
  assert.equal(parseRelease({ ...release(), draft: true }), null);
  assert.equal(parseRelease({ ...release(), prerelease: true }), null);
  assert.equal(parseRelease({ ...release(), assets: [] }), null);
  const other = release(); other.assets[0].browser_download_url = 'https://example.com/Always-Dark.zip';
  assert.equal(parseRelease(other), null);
});
test('falha de rede preserva o fallback e não inventa uma versão', async () => {
  assert.equal(await fetchLatestRelease(async () => { throw new Error('offline'); }), null);
  assert.equal(await fetchLatestRelease(async () => ({ ok: false })), null);
  assert.equal((await fetchLatestRelease(async () => ({ ok: true, json: async () => release('3.1.2') }))).version, '3.1.2');
});
