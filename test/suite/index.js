'use strict';
const path = require('path');
const fs = require('fs');
const Mocha = require('mocha');

exports.run = function run() {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
  for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js'))) mocha.addFile(path.join(__dirname, f));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures ? reject(new Error(`${failures} integration test(s) failed`)) : resolve()));
  });
};
