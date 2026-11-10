import './package.mjs';
import { readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(resolve(root, 'extension/manifest.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Versão inválida no manifesto.');
const notes = resolve(root, `docs/releases/${version}.md`);
await access(notes);
const asset = resolve(root, 'releases/Always-Dark.zip');

if (!process.argv.includes('--publish')) {
  console.log(`Release v${version} preparada localmente.\nPara publicar: npm run release -- --publish`);
} else {
  const git = async (...args) => (await run('git', args, { cwd: root })).stdout.trim();
  if (await git('status', '--porcelain')) throw new Error('Faça commit e push das alterações antes de publicar a release.');
  const commit = await git('rev-parse', 'HEAD');
  const remote = (await git('ls-remote', 'origin', 'refs/heads/main')).split(/\s/)[0];
  if (commit !== remote) throw new Error('O commit local precisa ser o mesmo de origin/main. Faça push antes de publicar.');
  const { stdout } = await run('gh', ['release', 'create', `v${version}`, asset,
    '--repo', 'Benfic4rthur/AlwaysDarkMode', '--target', commit, '--latest',
    '--title', `Always Dark ${version}`, '--notes-file', notes], { cwd: root });
  console.log(stdout.trim());
}
