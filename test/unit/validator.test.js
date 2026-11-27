'use strict';
// The extension's validator must agree with Ajv (full draft 2020-12) on every generated input,
// and on every recipe in crossly-dev/crossly-recipes when RECIPES_DIR points at a checkout.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020').default;
const { validate, validateDocument, assertSupportedSchema, SCHEMA_URL, EXAMPLE_RECIPE } = require('../../src/validator');

const schema = require('../../schemas/automation-recipe-v1.json');
const bundleSchema = require('../../schemas/automation-recipe-bundle-v1.json');
const ajv = new Ajv2020({ allErrors: true, strict: false });
const ajvValidate = ajv.compile(schema);

function agree(instance, label) {
  const ours = validate(schema, instance);
  const theirs = ajvValidate(instance);
  assert.equal(ours.length === 0, theirs, `${label}: extension says ${ours.length ? JSON.stringify(ours) : 'valid'}, Ajv says ${theirs ? 'valid' : JSON.stringify(ajvValidate.errors)}`);
  return theirs;
}

function minimal(s) {
  if (Object.hasOwn(s, 'const')) return s.const;
  if (s.enum) return s.enum[0];
  if (s.oneOf) return minimal(s.oneOf[0]);
  switch (s.type) {
    case 'object': {
      const o = {};
      for (const k of s.required ?? []) o[k] = minimal(s.properties[k]);
      return o;
    }
    case 'array':
      return [];
    case 'string':
      return 'x'.repeat(Math.max(1, s.minLength ?? 1));
    case 'integer':
      return 1;
    case 'number':
      return 1.5;
    case 'boolean':
      return true;
    default:
      return null;
  }
}

function full(s) {
  if (Object.hasOwn(s, 'const')) return s.const;
  if (s.enum) return s.enum[s.enum.length - 1];
  if (s.oneOf) return full(s.oneOf[s.oneOf.length - 1]);
  if (s.type === 'object') return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, full(v)]));
  if (s.type === 'array') return s.items ? [full(s.items)] : [];
  return minimal(s);
}

const base = () => ({ schemaVersion: 1, name: 'test', trigger: minimal(schema.properties.trigger), action: minimal(schema.properties.action) });

test('the schema only uses keywords the validator implements', () => {
  assert.doesNotThrow(() => assertSupportedSchema(schema));
});

test('the example recipe and the good fixture are valid', () => {
  assert.equal(agree(EXAMPLE_RECIPE, 'example'), true);
  const good = fs.readFileSync(path.join(__dirname, '../fixtures/workspace/good.crossly-recipe.json'), 'utf8');
  assert.equal(validateDocument(schema, good).ok, true);
});

for (const slot of ['trigger', 'condition', 'action']) {
  test(`${slot}: every type and its mutations agree with Ajv`, () => {
    for (const b of schema.properties[slot].oneOf) {
      const type = b.properties.type.const;
      assert.equal(agree({ ...base(), [slot]: minimal(b) }, `${type} minimal`), true);
      assert.equal(agree({ ...base(), [slot]: full(b) }, `${type} full`), true);
      agree({ ...base(), [slot]: { ...full(b), extra: 1 } }, `${type} extra`);
      agree({ ...base(), [slot]: { type: `${type}x` } }, `${type} unknown`);
      const cfg = b.properties.config;
      if (!cfg) continue;
      agree({ ...base(), [slot]: { type, config: { ...full(cfg), bogus: true } } }, `${type} bogus key`);
      for (const req of cfg.required ?? []) {
        const c = full(cfg);
        delete c[req];
        agree({ ...base(), [slot]: { type, config: c } }, `${type} missing ${req}`);
      }
      for (const [k, p] of Object.entries(cfg.properties ?? {})) {
        if (p.type === 'integer') agree({ ...base(), [slot]: { type, config: { ...full(cfg), [k]: 1.5 } } }, `${type} ${k} non-integer`);
        if (p.enum) agree({ ...base(), [slot]: { type, config: { ...full(cfg), [k]: '__nope__' } } }, `${type} ${k} enum`);
        agree({ ...base(), [slot]: { type, config: { ...full(cfg), [k]: { nested: true } } } }, `${type} ${k} object`);
      }
    }
  });
}

test('top-level mutations agree with Ajv', () => {
  const noName = base();
  delete noName.name;
  for (const [label, v] of Object.entries({
    noName,
    empty: { ...base(), name: '' },
    n200: { ...base(), name: 'n'.repeat(200) },
    n201: { ...base(), name: 'n'.repeat(201) },
    astral: { ...base(), name: '😀'.repeat(200) },
    v2: { ...base(), schemaVersion: 2 },
    vs: { ...base(), schemaVersion: '1' },
    extra: { ...base(), enabled: true },
    withSchema: { ...base(), $schema: SCHEMA_URL },
    arr: [base()],
    nul: null,
  })) agree(v, label);
});

test('the bundle schema accepts what the validator accepts as a bundle', () => {
  const ajvB = new Ajv2020({ strict: false });
  ajvB.addSchema(schema, new URL('./automation-recipe-v1.json', 'https://x.invalid/schemas/').href);
  const vb = ajvB.compile({ ...bundleSchema, $id: 'https://x.invalid/schemas/automation-recipe-bundle-v1.json' });
  const good = { schemaVersion: 1, recipes: [base(), base()] };
  const bad = { schemaVersion: 1, recipes: [base(), { ...base(), name: '' }] };
  assert.equal(vb(good), true);
  assert.equal(validateDocument(schema, JSON.stringify(good)).ok, true);
  assert.equal(vb(bad), false);
  assert.equal(validateDocument(schema, JSON.stringify(bad)).ok, false);
  assert.equal(vb({ schemaVersion: 1, recipes: [] }), false);
  assert.equal(validateDocument(schema, '{"schemaVersion":1,"recipes":[]}').ok, false);
});

function* jsonFiles(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) yield* jsonFiles(p);
    else if (name.endsWith('.json')) yield p;
  }
}
const RECIPES_DIR = process.env.RECIPES_DIR;
test('every recipe in crossly-dev/crossly-recipes', { skip: !(RECIPES_DIR && fs.existsSync(path.join(RECIPES_DIR, 'recipes'))) && 'set RECIPES_DIR' }, () => {
  let n = 0;
  for (const file of jsonFiles(path.join(RECIPES_DIR, 'recipes'))) {
    const text = fs.readFileSync(file, 'utf8');
    const doc = JSON.parse(text);
    for (const r of Array.isArray(doc.recipes) ? doc.recipes : [doc]) {
      agree(r, file);
      n += 1;
    }
    assert.equal(validateDocument(schema, text).ok, true, file);
  }
  assert.ok(n > 0);
});

test('the bundled schema matches the live one', { skip: process.env.ONLINE !== '1' && 'set ONLINE=1' }, async () => {
  const res = await fetch(SCHEMA_URL);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), schema, 'schemas/automation-recipe-v1.json is stale: copy the live schema in');
});
