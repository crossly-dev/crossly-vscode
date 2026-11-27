'use strict';
// Downloads VS Code and runs test/suite inside it with this extension loaded (CI: under xvfb).
const path = require('path');
const { runTests } = require('@vscode/test-electron');

(async () => {
  try {
    await runTests({
      version: process.env.VSCODE_VERSION || 'stable',
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, 'suite', 'index.js'),
      launchArgs: [path.resolve(__dirname, 'fixtures', 'workspace'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
    });
  } catch (err) {
    console.error('Integration tests failed:', err);
    process.exit(1);
  }
})();
