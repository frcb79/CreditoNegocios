const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const landingIndex = resolve('landing', 'index.html');
const outputDirs = [resolve('dist', 'public'), resolve('public')];

if (!existsSync(landingIndex)) {
  console.error('landing/index.html not found for static landing build');
  process.exit(1);
}

for (const outputDir of outputDirs) {
  const outputIndex = join(outputDir, 'index.html');
  mkdirSync(outputDir, { recursive: true });
  copyFileSync(landingIndex, outputIndex);
  console.log('Static landing build completed:', outputIndex);
}