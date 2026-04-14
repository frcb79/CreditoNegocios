const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function emitLandingPublic() {
  const landingIndex = resolve('landing', 'index.html');
  const publicDir = resolve('public');
  const publicIndex = join(publicDir, 'index.html');

  if (!existsSync(landingIndex)) return;

  mkdirSync(publicDir, { recursive: true });
  copyFileSync(landingIndex, publicIndex);
  console.log('Static landing copy completed:', publicIndex);
}

function runViteBuild() {
  let viteBin;

  try {
    viteBin = require.resolve('vite/bin/vite.js');
  } catch {
    const fallback = spawnSync('npm', ['exec', '--yes', 'vite', 'build'], {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });

    if (typeof fallback.status === 'number') {
      if (fallback.status === 0) {
        emitLandingPublic();
      }
      process.exit(fallback.status);
    }

    process.exit(1);
  }

  const result = spawnSync(process.execPath, [viteBin, 'build'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number') {
    if (result.status === 0) {
      emitLandingPublic();
    }
    process.exit(result.status);
  }

  process.exit(1);
}

runViteBuild();