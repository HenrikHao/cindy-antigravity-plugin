'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createMaintenance, download, fail, json, run, versionPattern } = require('./cli-maintenance.cjs');
const { detectAgy, killTree, spawnAgy } = require('./resolve-agy.js');

const manifestHost = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app';
const storage = 'https://storage.googleapis.com';
const win = process.platform === 'win32';

async function latest() {
  const osName = { darwin: 'darwin', win32: 'windows', linux: 'linux' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!osName || !arch) fail('unsupported');
  const musl = osName === 'linux' && !process.report.getReport().header.glibcVersionRuntime ? '_musl' : '';
  const release = await json(manifestHost + '/manifests/' + osName + '_' + arch + musl + '.json');
  if (!versionPattern.test(release.version) || !/^[a-f0-9]{128}$/.test(release.sha512) ||
      typeof release.url !== 'string' || !release.url.startsWith(storage + '/antigravity-public/antigravity-cli/')) fail('source');
  return release;
}

async function installed() {
  const check = await detectAgy({ timeoutMs: 10000 });
  return { present: !!check.path, runnable: check.available, version: check.version, path: check.path };
}

function updateNative(file) {
  return new Promise((resolve, reject) => {
    const child = spawnAgy(file, ['update'], { stdio: 'ignore' });
    const timer = setTimeout(() => killTree(child, 'SIGKILL'), 240000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('Antigravity update failed'));
    });
  });
}

async function install(release, current) {
  const home = os.homedir();
  const bin = win ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'agy', 'bin') :
    path.join(home, '.local', 'bin');
  const target = path.join(bin, win ? 'agy.exe' : 'agy');
  // Respect package managers and alternate install locations.
  if (current.path && (win ? current.path.toLowerCase() !== target.toLowerCase() : current.path !== target)) {
    return updateNative(current.path);
  }
  await fs.mkdir(bin, { recursive: true });
  const stage = await fs.mkdtemp(path.join(bin, '.agy-install-'));
  try {
    const file = path.join(stage, win ? 'agy.exe' : 'payload.tar.gz');
    await download(release.url, [storage], file, 'sha512', release.sha512, 256 * 1024 * 1024);
    const archive = new URL(release.url).pathname.endsWith('.tar.gz');
    const executable = archive ? path.join(stage, 'antigravity') : file;
    if (archive) {
      await run('/usr/bin/tar', ['-xzf', file, '-C', stage, 'antigravity']);
      if (!(await fs.lstat(executable)).isFile()) fail('integrity');
    }
    if (!win) await fs.chmod(executable, 0o755);
    const { stdout } = await run(executable, ['--version'], {
      timeout: 15000, env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: 'true' },
    });
    if (stdout.trim().replace(/^v/, '') !== release.version) fail('verify');
    await fs.rename(executable, target).catch(error => {
      if (['EBUSY', 'EPERM'].includes(error.code) && current.present) fail('close-agy');
      throw error;
    });
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = createMaintenance({ latest, installed, install });
