#!/usr/bin/env node

/**
 * Extension validation script - checks extension files and structure
 * This runs without browser automation to verify extension is ready for E2E testing
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const extensionRoot = join(__dirname, '../../');

function validateExtension() {
  console.log('Validating Video Speed Controller extension structure\n');

  let passed = 0;
  let failed = 0;

  const test = (name, condition, details = '') => {
    if (condition) {
      console.log(`PASS ${name}`);
      passed++;
    } else {
      console.log(`FAIL ${name}${details ? `: ${details}` : ''}`);
      failed++;
    }
  };

  // Check core files
  test('manifest.json exists', existsSync(join(extensionRoot, 'manifest.json')));
  test('inject.css exists', existsSync(join(extensionRoot, 'src/styles/inject.css')));

  // Check bundled files
  test('dist/content-bridge.js exists', existsSync(join(extensionRoot, 'dist/content-bridge.js')));
  test('dist/inject.js exists', existsSync(join(extensionRoot, 'dist/inject.js')));
  test('dist/background.js exists', existsSync(join(extensionRoot, 'dist/background.js')));
  test('dist/ui/popup/popup.js exists', existsSync(join(extensionRoot, 'dist/ui/popup/popup.js')));
  test(
    'dist/ui/options/options.js exists',
    existsSync(join(extensionRoot, 'dist/ui/options/options.js'))
  );

  // Check source structure (still needed for unit tests)
  test('src/content/inject.js exists', existsSync(join(extensionRoot, 'src/content/inject.js')));
  test('src/core/ directory exists', existsSync(join(extensionRoot, 'src/core')));
  test('src/utils/ directory exists', existsSync(join(extensionRoot, 'src/utils')));
  test('src/ui/ directory exists', existsSync(join(extensionRoot, 'src/ui')));

  // Check key modules
  test('VideoController exists', existsSync(join(extensionRoot, 'src/core/video-controller.js')));
  test('Settings module exists', existsSync(join(extensionRoot, 'src/core/settings.js')));
  test('ActionHandler exists', existsSync(join(extensionRoot, 'src/core/action-handler.js')));
  test('ShadowDOM manager exists', existsSync(join(extensionRoot, 'src/ui/shadow-dom.js')));

  // Validate manifest.json structure
  try {
    const sourceManifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'dist/manifest.json'), 'utf8'));

    test(
      'Root manifest popup path exists',
      existsSync(join(extensionRoot, sourceManifest.action?.default_popup || '')),
      sourceManifest.action?.default_popup
    );
    test(
      'Dist manifest popup path exists',
      existsSync(join(extensionRoot, 'dist', manifest.action?.default_popup || '')),
      manifest.action?.default_popup
    );
    for (const [size, iconPath] of Object.entries(sourceManifest.icons || {})) {
      test(
        `Root manifest icon ${size} exists`,
        existsSync(join(extensionRoot, iconPath)),
        iconPath
      );
    }
    for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
      test(
        `Dist manifest icon ${size} exists`,
        existsSync(join(extensionRoot, 'dist', iconPath)),
        iconPath
      );
    }
    for (const [size, iconPath] of Object.entries(sourceManifest.action?.default_icon || {})) {
      test(`Root action icon ${size} exists`, existsSync(join(extensionRoot, iconPath)), iconPath);
    }
    for (const [size, iconPath] of Object.entries(manifest.action?.default_icon || {})) {
      test(
        `Dist action icon ${size} exists`,
        existsSync(join(extensionRoot, 'dist', iconPath)),
        iconPath
      );
    }
    test('Manifest version is 3', manifest.manifest_version === 3);
    test(
      'Firefox background script defined',
      manifest.background?.scripts?.includes('background.js')
    );
    test('No service worker background', !manifest.background?.service_worker);
    test('No Chromium minimum version key', !manifest.minimum_chrome_version);
    test(
      'Content scripts defined',
      manifest.content_scripts && manifest.content_scripts.length > 0
    );
    test(
      'Isolated bridge uses bundled file',
      manifest.content_scripts[0].js && manifest.content_scripts[0].js[0] === 'content-bridge.js'
    );
    test(
      'Main-world script uses bundled file',
      manifest.content_scripts[1].js && manifest.content_scripts[1].js[0] === 'inject.js'
    );
    test(
      'Required permissions present',
      manifest.permissions && manifest.permissions.includes('storage')
    );
    test(
      'Content script matches all sites',
      manifest.content_scripts[0].matches &&
        manifest.content_scripts[0].matches.includes('https://*/*')
    );
  } catch (error) {
    test('dist/manifest.json is valid JSON', false, error.message);
  }

  // Check main inject script
  try {
    const injectScript = readFileSync(join(extensionRoot, 'src/content/inject.js'), 'utf8');

    test('Inject script exports VSC_controller', injectScript.includes('window.VSC_controller'));
    test('Inject script initializes extension', injectScript.includes('initialize'));
  } catch (error) {
    test('Inject script readable', false, error.message);
  }

  // Verify no references to deleted files
  try {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const manifestStr = JSON.stringify(manifest);
    test('No reference to injector.js', !manifestStr.includes('injector.js'));
    test('No reference to module-loader.js', !manifestStr.includes('module-loader.js'));
  } catch (error) {
    test('Manifest clean of old files', false, error.message);
  }

  // Check for test files
  test('Unit tests exist', existsSync(join(extensionRoot, 'tests/unit')));
  test('Integration tests exist', existsSync(join(extensionRoot, 'tests/integration')));
  test('E2E tests exist', existsSync(join(extensionRoot, 'tests/e2e')));

  // Check package.json scripts
  try {
    const packageJson = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8'));

    test('Test scripts defined', packageJson.scripts && packageJson.scripts.test);
    test('E2E test script defined', packageJson.scripts && packageJson.scripts['test:e2e']);
    test('Type is module', packageJson.type === 'module');
  } catch (error) {
    test('Package.json is valid', false, error.message);
  }

  console.log('\nValidation Summary');
  console.log('=====================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\nExtension structure is valid and ready for Firefox testing.');
    console.log('\nNext Steps:');
    console.log(
      '1. Load manifest.json or dist/manifest.json as a temporary add-on from about:debugging#/runtime/this-firefox'
    );
    console.log('2. Navigate to: https://www.youtube.com/watch?v=gGCJOTvECVQ');
    console.log('3. Verify speed controller appears on video');
    console.log('4. Test speed controls and keyboard shortcuts');
    console.log('\nSee tests/e2e/manual-test-guide.md for detailed testing instructions.');
  } else {
    console.log('\nPlease fix the failed validation items before testing.');
  }

  return failed === 0;
}

// Run validation
const isValid = validateExtension();
process.exit(isValid ? 0 : 1);
