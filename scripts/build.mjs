import { build } from 'esbuild';
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'extension');
await mkdir(resolve(output, 'icons'), { recursive: true });
const shared = { bundle: true, minify: true, target: 'chrome119', legalComments: 'none', logLevel: 'warning' };
const engineSource = (await readFile(resolve(root, 'node_modules/darkreader/darkreader.mjs'), 'utf8')).replaceAll('\r\n', '\n');
const proxyStart = engineSource.indexOf('function injectProxy(');
const proxyEnd = engineSource.indexOf('\n}\n', proxyStart) + 2;
if (proxyStart < 0 || proxyEnd < proxyStart) throw new Error('Review the Dark Reader proxy adapter.');
await build({
  ...shared,
  stdin: {
    contents: `document.dispatchEvent(new CustomEvent('__darkreader__cleanUp'));\n(${engineSource.slice(proxyStart, proxyEnd)})(true, true);`,
    sourcefile: 'darkreader-proxy.js',
  },
  outfile: resolve(output, 'proxy.js'), format: 'iife',
  banner: { js: '/* Dark Reader 4.9.135, MIT. See THIRD_PARTY_LICENSES.txt. */' },
});
await build({ ...shared, entryPoints: ['src/background.js', 'src/popup.js'], outdir: output, format: 'esm' });
await build({
  ...shared, entryPoints: ['src/content.js'], outfile: resolve(output, 'content.js'), format: 'iife',
  banner: { js: '/* Dark Reader 4.9.135, MIT. See THIRD_PARTY_LICENSES.txt. */\nif (globalThis.__ADM__ && !globalThis.__ADM__.alive?.()) { globalThis.__ADM__.dispose?.(); delete globalThis.__ADM__; }\nif (!globalThis.__ADM__) {' },
  footer: { js: '} else { void globalThis.__ADM__.sync(); }' },
  plugins: [{
    name: 'isolate-darkreader-runtime',
    setup(builder) {
      builder.onLoad({ filter: /node_modules\/darkreader\/darkreader\.m?js$/ }, async args => {
        // The website API shims chrome.runtime. Give it a module-local shim so it
        // cannot intercept or replace the real extension messaging functions.
        let source = (await readFile(args.path, 'utf8')).replaceAll('\r\n', '\n');
        if (!source.includes('const messageListeners = new Set()')) throw new Error('Review the Dark Reader API adapter after an upgrade.');
        const inlineStart = source.indexOf('    const enableStyleSheetsProxy = !(fixes && fixes.disableStyleSheetsProxy);');
        const inlineEnd = source.indexOf('    staticStyleInjector.inject(\n        "override",', inlineStart);
        if (inlineStart < 0 || inlineEnd < inlineStart) throw new Error('Review the Dark Reader CSP adapter after an upgrade.');
        // MV3 forbids the API's inline proxy script. The worker injects the same
        // packaged proxy in MAIN world using scripting.executeScript instead.
        source = source.slice(0, inlineStart) + source.slice(inlineEnd);
        const oldWatcher = '        if (element instanceof HTMLStyleElement) {\n            sheetChangeWatcher.start();\n        }';
        if (!source.includes(oldWatcher)) throw new Error('Review the CSSOM watcher adapter.');
        source = source.replace(oldWatcher, '        if (element instanceof HTMLStyleElement || element instanceof HTMLLinkElement) {\n            sheetChangeWatcher.start();\n        }');
        const shadowCleanup = '        removeNode(root.querySelector(".darkreader--override"));';
        if (!source.includes(shadowCleanup)) throw new Error('Review the shadow stylesheet cleanup adapter.');
        source = source.replace(shadowCleanup, `${shadowCleanup}\n        removeNode(root.querySelector(".darkreader--invert"));`);
        return { contents: `const chrome = { runtime: {} };\n${source}`, loader: 'js', resolveDir: resolve(root, 'node_modules/darkreader') };
      });
    },
  }],
});
for (const file of ['manifest.json', 'popup.html', 'popup.css']) await copyFile(resolve(root, 'src', file), resolve(output, file));
await copyFile(resolve(root, 'src/icons/icon.svg'), resolve(output, 'icons/icon.svg'));
for (const size of [16, 32, 48, 128]) {
  await sharp(resolve(root, 'src/icons/icon.svg')).resize(size, size).png().toFile(resolve(output, `icons/icon-${size}.png`));
}
const license = await readFile(resolve(root, 'node_modules/darkreader/LICENSE'), 'utf8');
await writeFile(resolve(output, 'THIRD_PARTY_LICENSES.txt'), `Dark Reader 4.9.135\nhttps://github.com/darkreader/darkreader\n\n${license}`);
async function total(directory) {
  let bytes = 0;
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name), info = await stat(path);
    bytes += info.isDirectory() ? await total(path) : info.size;
  }
  return bytes;
}
console.log(`Extensão pronta: ${output}\nTamanho total: ${(await total(output) / 1024).toFixed(1)} KiB`);
