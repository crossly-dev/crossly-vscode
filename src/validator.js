'use strict';
// Automation recipe validator: checks a recipe, or a bundle of recipes, against the published JSON
// Schema, https://crossly.net/schemas/automation-recipe-v1.json. Same implementation as
// crossly-dev/crossly-playground (js/recipe.js).
//
// The schema is draft 2020-12 and uses a small set of keywords. This validator implements exactly
// those, and throws on any keyword it does not know, so a schema change can never be silently
// half-checked. test/unit/validator.test.js runs generated inputs through Ajv (draft 2020-12) and
// fails if the two ever disagree on a verdict.

const SCHEMA_URL = 'https://crossly.net/schemas/automation-recipe-v1.json';

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', '$comment', 'examples', 'default']);
const SUPPORTED = new Set([
  ...ANNOTATIONS,
  'type',
  'properties',
  'required',
  'additionalProperties',
  'const',
  'enum',
  'oneOf',
  'minLength',
  'maxLength',
  'items',
]);

/** Throws if the schema uses a keyword this validator does not implement. */
function assertSupportedSchema(schema, path = '#') {
  if (Array.isArray(schema)) return schema.forEach((s, i) => assertSupportedSchema(s, `${path}/${i}`));
  if (!schema || typeof schema !== 'object') return;
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED.has(k)) throw new Error(`Unsupported JSON Schema keyword "${k}" at ${path}. The playground validator needs updating.`);
    if (k === 'properties') for (const [p, s] of Object.entries(v)) assertSupportedSchema(s, `${path}/properties/${p}`);
    else if (k === 'oneOf') v.forEach((s, i) => assertSupportedSchema(s, `${path}/oneOf/${i}`));
    else if (k === 'items' || (k === 'additionalProperties' && typeof v === 'object')) assertSupportedSchema(v, `${path}/${k}`);
  }
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(value, type) {
  const t = typeOf(value);
  if (type === 'number') return t === 'number' || t === 'integer';
  return t === type;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b) && !(typeof a === 'number' && typeof b === 'number')) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

const ptr = (path, key) => `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));
// JS string length counts UTF-16 units; JSON Schema counts code points.
const codePoints = (s) => [...s].length;

/** Validate `value` against `schema`. Returns a list of { path, message } (JSON Pointer paths). */
function validate(schema, value, path = '') {
  const errors = [];
  if (schema === true || schema === undefined) return errors;
  if (schema === false) return [{ path, message: 'is not allowed here' }];

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      return [{ path, message: `must be ${types.join(' or ')}, got ${typeOf(value)}` }];
    }
  }
  if (Object.hasOwn(schema, 'const') && !deepEqual(value, schema.const)) {
    errors.push({ path, message: `must be ${show(schema.const)}` });
  }
  if (schema.enum && !schema.enum.some((e) => deepEqual(value, e))) {
    errors.push({ path, message: `must be one of ${schema.enum.map(show).join(', ')}` });
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && codePoints(value) < schema.minLength) errors.push({ path, message: `must be at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'}` });
    if (schema.maxLength !== undefined && codePoints(value) > schema.maxLength) errors.push({ path, message: `must be at most ${schema.maxLength} characters` });
  }
  if (typeOf(value) === 'object') {
    for (const req of schema.required ?? []) {
      if (!Object.hasOwn(value, req)) errors.push({ path, message: `is missing required property "${req}"` });
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k)) errors.push(...validate(props[k], v, ptr(path, k)));
      else if (schema.additionalProperties === false) {
        const known = Object.keys(props);
        const near = closest(k, known);
        errors.push({ path: ptr(path, k), message: `is not an allowed property${near ? ` (did you mean "${near}"?)` : known.length ? ` (allowed: ${known.join(', ')})` : ''}` });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validate(schema.additionalProperties, v, ptr(path, k)));
      }
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => errors.push(...validate(schema.items, item, ptr(path, i))));
  }
  if (schema.oneOf) errors.push(...validateOneOf(schema.oneOf, value, path));
  return errors;
}

// The recipe schema's oneOf branches are tagged unions: each branch pins properties.type.const.
// When a branch's tag matches, report that branch's errors, which is what a person needs to fix.
function validateOneOf(branches, value, path) {
  const results = branches.map((b) => validate(b, value, path));
  const passing = results.filter((r) => r.length === 0).length;
  if (passing === 1) return [];
  if (passing > 1) return [{ path, message: `matches ${passing} alternatives; it must match exactly one` }];
  const tags = branches.map((b) => b?.properties?.type?.const).filter((t) => typeof t === 'string');
  if (tags.length === branches.length && typeOf(value) === 'object') {
    if (!Object.hasOwn(value, 'type')) return [{ path, message: 'is missing required property "type"' }];
    const i = tags.indexOf(value.type);
    if (i >= 0) return results[i];
    const near = typeof value.type === 'string' ? closest(value.type, tags) : null;
    return [{ path: ptr(path, 'type'), message: `${show(value.type)} is not a known type${near ? ` (did you mean "${near}"?)` : ''}` }];
  }
  return [{ path, message: 'does not match any allowed alternative' }];
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function closest(word, candidates) {
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const dd = distance(word.toLowerCase(), c.toLowerCase());
    if (dd < bestD) [best, bestD] = [c, dd];
  }
  return best && bestD <= Math.max(2, Math.floor(word.length / 4)) ? best : null;
}

/** JSON.parse with a line and column in the error message. */
function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    let where = '';
    if (m) {
      const pos = Number(m[1]);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      where = ` (line ${line}, column ${col})`;
    } else {
      const lc = /line (\d+) column (\d+)/.exec(e.message);
      if (lc) where = ` (line ${lc[1]}, column ${lc[2]})`;
    }
    return { ok: false, error: `Not valid JSON${where}: ${e.message}` };
  }
}

/**
 * Validate a pasted document: a single recipe, or a bundle `{ schemaVersion, recipes: [...] }`
 * (the shape crossly-dev/crossly-recipes publishes as recipes/all.json and the import API accepts).
 * @returns {{ ok: boolean, kind: 'recipe'|'bundle'|'invalid', recipes: Array<{ index: number|null, name?: string, trigger?: string, action?: string, errors: Array<{path:string,message:string}> }>, error?: string }}
 */
function validateDocument(schema, text) {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, kind: 'invalid', recipes: [], error: parsed.error };
  const doc = parsed.value;
  const summarise = (r, index, base) => ({
    index,
    name: typeof r?.name === 'string' ? r.name : undefined,
    trigger: typeof r?.trigger?.type === 'string' ? r.trigger.type : undefined,
    action: typeof r?.action?.type === 'string' ? r.action.type : undefined,
    errors: validate(schema, r, base),
  });
  if (doc && typeof doc === 'object' && !Array.isArray(doc) && Array.isArray(doc.recipes) && !('trigger' in doc)) {
    const top = [];
    if (doc.schemaVersion !== 1) top.push({ path: '/schemaVersion', message: 'must be 1' });
    for (const k of Object.keys(doc)) if (!['schemaVersion', 'recipes', '$schema'].includes(k)) top.push({ path: ptr('', k), message: 'is not an allowed bundle property (expected schemaVersion and recipes)' });
    if (doc.recipes.length === 0) top.push({ path: '/recipes', message: 'is empty' });
    const recipes = doc.recipes.map((r, i) => summarise(r, i, `/recipes/${i}`));
    if (top.length) recipes.unshift({ index: null, name: 'bundle', errors: top });
    return { ok: recipes.every((r) => r.errors.length === 0), kind: 'bundle', recipes };
  }
  const one = summarise(doc, null, '');
  return { ok: one.errors.length === 0, kind: 'recipe', recipes: [one] };
}

/** A minimal valid recipe, for the "load example" button and the editor snippets. */
const EXAMPLE_RECIPE = {
  $schema: SCHEMA_URL,
  schemaVersion: 1,
  name: 'Thank buyers after a sale',
  trigger: { type: 'listing.sold' },
  action: { type: 'inbox.send_thank_you' },
};

module.exports = { SCHEMA_URL, assertSupportedSchema, validate, parseJson, validateDocument, EXAMPLE_RECIPE };
