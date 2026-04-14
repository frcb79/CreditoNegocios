const { spawnSync } = require('node:child_process');

function runViteBuild() {
  let viteBin;

  try {
    viteBin = require.resolve('vite/bin/vite.js');
  } catch {
    console.error('vite is not installed. App build requires dev dependencies.');
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [viteBin, 'build'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(1);
}

runViteBuild();