import './build.mjs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const destination = resolve('releases');
await mkdir(destination, { recursive: true });
const file = resolve(destination, 'Always-Dark-1.0.0.zip');
await rm(file, { force: true });
await promisify(execFile)('/usr/bin/zip', ['-q', '-r', file, '.', '-x', '*.DS_Store'], { cwd: resolve('extension') });
console.log(`Pacote: ${file}\n${((await stat(file)).size / 1024).toFixed(1)} KiB compactados`);
