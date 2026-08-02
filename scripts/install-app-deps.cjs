const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const env = { ...process.env };

if (
  process.platform !== 'win32' &&
  !Object.hasOwn(env, 'npm_config_python') &&
  existsSync('/usr/bin/python3')
) {
  env.npm_config_python = '/usr/bin/python3';
}

const result = spawnSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), 'install-app-deps'],
  { env, stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
