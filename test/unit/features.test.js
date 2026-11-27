'use strict';
// Hover docs, diagnostics spans, snippets and the manifest, without VS Code.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hoverAt } = require('../../src/hover');
const { problemsFor, pointerToSegments } = require('../../src/problems');

const schema = require('../../schemas/automation-recipe-v1.json');
const fixture = (name) => fs.readFileSync(path.join(__dirname, '../fixtures/workspace', name), 'utf8');
const at = (text, needle, delta = 1) => {
  const i = text.indexOf(needle);
  assert.ok(i >= 0, needle);
  return i + delta;
};

test('hover on a trigger type value shows its title and config', () => {
  const text = '{"schemaVersion":1,"name":"x","trigger":{"type":"schedule.cron","config":{"cron":"0 9 * * *"}},"action":{"type":"inbox.send_thank_you"}}';
  const md = hoverAt(text, at(text, '"schedule.cron"', 3), schema);
  const branch = schema.properties.trigger.oneOf.find((b) => b.properties.type.const === 'schedule.cron');
  assert.match(md, new RegExp(branch.title));
  assert.match(md, /`cron` \(required\)/);
  assert.match(md, /`timezone`/);
});

test('hover on a config key shows its description', () => {
  const text = '{"schemaVersion":1,"name":"x","trigger":{"type":"schedule.cron","config":{"cron":"0 9 * * *"}},"action":{"type":"inbox.send_thank_you"}}';
  const md = hoverAt(text, at(text, '"cron"', 2), schema);
  assert.match(md, /\*\*cron\*\* \(required\)/);
  assert.match(md, /cron expression/i);
});

test('hover works inside a bundle and on top-level keys', () => {
  const text = fixture('bundle.crossly-recipes.json');
  const md = hoverAt(text, at(text, '"listing.sold"', 3), schema);
  assert.match(md, /trigger `listing.sold`/);
  const name = hoverAt(text, at(text, '"name"', 2), schema);
  assert.match(name, /\*\*name\*\* \(required\)/);
});

test('hover on an unknown type says so', () => {
  const text = fixture('bad.crossly-recipe.json');
  assert.match(hoverAt(text, at(text, '"listing.sol"', 3), schema), /not a known trigger type/);
});

test('every trigger, condition and action has hover docs', () => {
  for (const slot of ['trigger', 'condition', 'action']) {
    for (const b of schema.properties[slot].oneOf) {
      const type = b.properties.type.const;
      const text = JSON.stringify({ [slot]: { type } });
      const md = hoverAt(text, text.indexOf(`"${type}"`) + 2, schema);
      assert.ok(md && md.includes(type), `${slot} ${type}`);
    }
  }
});

test('diagnostics point at the right text', () => {
  const text = fixture('bad.crossly-recipe.json');
  const r = problemsFor(text, schema);
  assert.equal(r.ok, false);
  const typo = r.problems.find((p) => p.path === '/trigger/type');
  assert.equal(text.slice(typo.start, typo.end), '"listing.sol"');
  assert.match(typo.message, /did you mean "listing.sold"/);
  const extra = r.problems.find((p) => p.path === '/enabled');
  assert.equal(text.slice(extra.start, extra.end), 'true');
});

test('diagnostics in a bundle carry the recipe index', () => {
  const r = problemsFor(fixture('bundle.crossly-recipes.json'), schema);
  assert.equal(r.kind, 'bundle');
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].path, '/recipes/1/name');
});

test('invalid JSON is located', () => {
  const text = '{\n  "name": "x",\n}';
  const r = problemsFor(text, schema);
  assert.equal(r.kind, 'invalid');
  assert.ok(r.problems[0].start > 0 && r.problems[0].start <= text.length);
});

test('good fixture has no problems', () => {
  assert.deepEqual(problemsFor(fixture('good.crossly-recipe.json'), schema).problems, []);
});

test('JSON Pointer segments', () => {
  assert.deepEqual(pointerToSegments('/recipes/1/a~1b/c~0d'), ['recipes', 1, 'a/b', 'c~d']);
  assert.deepEqual(pointerToSegments(''), []);
});

test('snippet choices are exactly the schema types', () => {
  const snippets = JSON.parse(fs.readFileSync(path.join(__dirname, '../../snippets/crossly-recipes.code-snippets'), 'utf8'));
  const choices = (body) => [...body.join('\n').matchAll(/\$\{\d+\|([^|]+)\|\}/g)].map((m) => m[1].split(','));
  for (const [name, slot] of [['Crossly trigger', 'trigger'], ['Crossly condition', 'condition'], ['Crossly action', 'action']]) {
    assert.deepEqual(choices(snippets[name].body)[0], schema.properties[slot].oneOf.map((b) => b.properties.type.const));
  }
  assert.match(snippets['Crossly recipe'].body.join('\n'), /"\\\$schema"/, '$schema must be escaped in snippet syntax');
});

test('manifest: schemas, snippets and commands exist', () => {
  const pkg = require('../../package.json');
  for (const v of pkg.contributes.jsonValidation) assert.ok(fs.existsSync(path.join(__dirname, '../..', v.url)), v.url);
  for (const s of pkg.contributes.snippets) assert.ok(fs.existsSync(path.join(__dirname, '../..', s.path)), s.path);
  const src = fs.readFileSync(path.join(__dirname, '../../src/extension.js'), 'utf8');
  for (const c of pkg.contributes.commands) assert.ok(src.includes(`'${c.command}'`), c.command);
  assert.ok(fs.existsSync(path.join(__dirname, '../..', pkg.icon)));
});
