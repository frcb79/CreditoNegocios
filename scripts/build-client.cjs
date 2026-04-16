const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function emitLandingPublic() {
  const landingIndex = resolve('landing', 'index.html');
  const landingLogoPng = resolve('landing', 'Credito Negocios-07.png');
  const landingLogoJpg = resolve('landing', 'Credito Negocios-07.jpg');
  const outputDirs = [resolve('public'), resolve('dist', 'public')];
  const htmlTargets = ['index.html', 'landing.html'];

  if (!existsSync(landingIndex)) return;

  for (const outputDir of outputDirs) {
    mkdirSync(outputDir, { recursive: true });

    for (const htmlTarget of htmlTargets) {
      copyFileSync(landingIndex, join(outputDir, htmlTarget));
    }

    if (existsSync(landingLogoPng)) {
      copyFileSync(landingLogoPng, join(outputDir, 'Credito Negocios-07.png'));
    }

    if (existsSync(landingLogoJpg)) {
      copyFileSync(landingLogoJpg, join(outputDir, 'Credito Negocios-07.jpg'));
    }

    console.log('Static landing copy completed:', join(outputDir, 'index.html'));
  }
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