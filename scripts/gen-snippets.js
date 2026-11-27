#!/usr/bin/env node
'use strict';
// Generates snippets/crossly-recipes.code-snippets from the bundled schema, so the trigger,
// condition and action choices are always exactly the schema's.
//   node scripts/gen-snippets.js          write
//   node scripts/gen-snippets.js --check  exit 1 if the file is out of date (CI)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const schema = require('../schemas/automation-recipe-v1.json');
const { SCHEMA_URL } = require('../src/validator');
const out = path.join(root, 'snippets', 'crossly-recipes.code-snippets');

const types = (slot) => schema.properties[slot].oneOf.map((b) => b.properties.type.const);
const choice = (n, list) => `\${${n}|${list.map((t) => t.replace(/[\,|$}]/g, (c) => `\${c}`)).join(',')}|}`;

const snippets = {
  'Crossly recipe': {
    prefix: 'crossly-recipe',
    description: 'A Crossly automation recipe: a trigger and an action.',
    body: [
      '{',
      `  "\\$schema": "${SCHEMA_URL}",`, // \$ escapes snippet variable syntax
      '  "schemaVersion": 1,',
      '  "name": "${1:What this rule does}",',
      `  "trigger": { "type": "${choice(2, types('trigger'))}" },`,
      `  "action": { "type": "${choice(3, types('action'))}" }$0`,
      '}',
    ],
  },
  'Crossly recipe with condition': {
    prefix: 'crossly-recipe-condition',
    description: 'A Crossly automation recipe with a trigger, a condition and an action.',
    body: [
      '{',
      `  "\\$schema": "${SCHEMA_URL}",`, // \$ escapes snippet variable syntax
      '  "schemaVersion": 1,',
      '  "name": "${1:What this rule does}",',
      '  "description": "${2}",',
      `  "trigger": { "type": "${choice(3, types('trigger'))}" },`,
      `  "condition": { "type": "${choice(4, types('condition'))}", "config": {$5} },`,
      `  "action": { "type": "${choice(6, types('action'))}" }$0`,
      '}',
    ],
  },
  'Crossly recipe bundle': {
    prefix: 'crossly-bundle',
    description: 'Several Crossly automation recipes in one file.',
    body: ['{', '  "schemaVersion": 1,', '  "recipes": [', '    $0', '  ]', '}'],
  },
  'Crossly trigger': {
    prefix: 'crossly-trigger',
    description: 'A recipe trigger. Hover the type for its config keys.',
    body: [`"trigger": { "type": "${choice(1, types('trigger'))}" }$0`],
  },
  'Crossly condition': {
    prefix: 'crossly-condition',
    description: 'A recipe condition. Hover the type for its config keys.',
    body: [`"condition": { "type": "${choice(1, types('condition'))}", "config": {$2} }$0`],
  },
  'Crossly action': {
    prefix: 'crossly-action',
    description: 'A recipe action. Hover the type for its config keys.',
    body: [`"action": { "type": "${choice(1, types('action'))}" }$0`],
  },
};

const text = `${JSON.stringify(snippets, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const have = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
  if (have !== text) {
    console.error('snippets/crossly-recipes.code-snippets is out of date: run node scripts/gen-snippets.js and commit.');
    process.exit(1);
  }
  console.log('OK: snippets match the schema.');
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`Wrote ${path.relative(root, out)}.`);
}
