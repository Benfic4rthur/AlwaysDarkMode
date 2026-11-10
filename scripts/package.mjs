import './build.mjs';
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const destination = resolve('releases');
await mkdir(destination, { recursive: true });
const { version } = JSON.parse(await readFile(resolve('extension/manifest.json'), 'utf8'));
const file = resolve(destination, `Always-Dark-${version}.zip`);
await rm(file, { force: true });
await promisify(execFile)('/usr/bin/zip', ['-q', '-r', file, '.', '-x', '*.DS_Store'], { cwd: resolve('extension') });
// Every GitHub release carries this stable asset name for /releases/latest/download/.
await copyFile(file, resolve(destination, 'Always-Dark.zip'));
console.log(`Pacote: ${file}\n${((await stat(file)).size / 1024).toFixed(1)} KiB compactados`);
