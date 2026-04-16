const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const landingIndex = resolve('landing', 'index.html');
const landingLogo = resolve('landing', 'Credito Negocios-07.png');
const landingLogoJpg = resolve('landing', 'Credito Negocios-07.jpg');
const outputTargets = [
  { outputDir: resolve('public'), htmlTargets: ['index.html', 'landing.html'] },
  { outputDir: resolve('dist', 'public'), htmlTargets: ['landing.html'] },
];

if (!existsSync(landingIndex)) {
  console.error('landing/index.html not found for static landing build');
  process.exit(1);
}

for (const { outputDir, htmlTargets } of outputTargets) {
  const outputLogo = join(outputDir, 'Credito Negocios-07.png');
  const outputLogoJpg = join(outputDir, 'Credito Negocios-07.jpg');
  mkdirSync(outputDir, { recursive: true });

  for (const htmlTarget of htmlTargets) {
    copyFileSync(landingIndex, join(outputDir, htmlTarget));
  }

  if (existsSync(landingLogo)) {
    copyFileSync(landingLogo, outputLogo);
  }

  if (existsSync(landingLogoJpg)) {
    copyFileSync(landingLogoJpg, outputLogoJpg);
  }

  for (const htmlTarget of htmlTargets) {
    console.log('Static landing build completed:', join(outputDir, htmlTarget));
  }
}