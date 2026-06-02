import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { existsSync } from 'node:fs';

const minNodeMajor = 22;
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const binExt = process.platform === 'win32' ? '.cmd' : '';

function parseMajor(version) {
  const match = /^(\d+)\./.exec(version);
  return match ? Number(match[1]) : NaN;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
      }
    });
  });
}

async function readVersion(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Failed to read version from ${command}`);
  }

  return String(result.stdout || '').trim();
}

async function main() {
  const nodeMajor = parseMajor(process.versions.node);
  if (!Number.isFinite(nodeMajor) || nodeMajor < minNodeMajor) {
    throw new Error(`Node.js ${minNodeMajor}.x or newer is required.`);
  }

  const npmVersion = await readVersion(npmBin);
  console.log(`Node.js ${process.versions.node}`);
  console.log(`npm ${npmVersion}`);

  if (!existsSync('node_modules')) {
    await run(npmBin, ['ci'], {
      env: {
        ...process.env,
        PUPPETEER_SKIP_DOWNLOAD: '1',
      },
    });
  } else {
    console.log('node_modules/ already exists, skipping npm ci');
  }
  await run(`node_modules/.bin/eslint${binExt}`, ['src/**/*.js', 'tests/**/*.js']);
  await run(process.execPath, ['scripts/build.mjs']);
  await run(`node_modules/.bin/vitest${binExt}`, ['run']);
  await run(process.execPath, ['scripts/build.mjs'], {
    env: {
      ...process.env,
      RELEASE: '1',
    },
  });
  await run(process.execPath, ['tests/e2e/validate-extension.js']);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
