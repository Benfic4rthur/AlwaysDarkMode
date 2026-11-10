import { copyFile, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'site/dist');
const manifest = JSON.parse(await readFile(resolve(root, 'extension/manifest.json'), 'utf8'));
const filename = `Always-Dark-${manifest.version}.zip`;
await mkdir(resolve(destination, 'assets'), { recursive: true });
await copyFile(resolve(root, 'src/icons/icon.svg'), resolve(destination, 'assets/always-dark.svg'));
async function size(directory) {
  let total = 0;
  for (const entry of await readdir(directory)) {
    const path = resolve(directory, entry), info = await stat(path);
    if (entry !== '.DS_Store') total += info.isDirectory() ? await size(path) : info.size;
  }
  return total;
}
await writeFile(resolve(destination, 'assets/release.json'), JSON.stringify({
  version: manifest.version, filename,
  bytes: (await stat(resolve(root, 'releases', filename))).size,
  installedBytes: await size(resolve(root, 'extension')),
}, null, 2) + '\n');
console.log('Site local preparado. O download aponta sempre para a última release do GitHub.');
