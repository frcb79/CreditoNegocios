const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function buildStaticLanding() {
  const landingIndex = resolve('landing', 'index.html');
  const outputDirs = [resolve('dist', 'public'), resolve('public')];

  if (!existsSync(landingIndex)) {
    console.error('landing/index.html not found for static fallback build');
    process.exit(1);
  }

  for (const outputDir of outputDirs) {
    const outputIndex = join(outputDir, 'index.html');
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(landingIndex, outputIndex);
    console.log('Static landing fallback build completed:', outputIndex);
  }
}

function runViteBuild() {
  let viteBin;

  try {
    viteBin = require.resolve('vite/bin/vite.js');
  } catch {
    return false;
  }

  const result = spawnSync(process.execPath, [viteBin, 'build'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  process.exit(1);
}

if (process.env.FORCE_STATIC_LANDING === '1') {
  buildStaticLanding();
  process.exit(0);
}

if (!runViteBuild()) {
  buildStaticLanding();
}