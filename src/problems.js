'use strict';
// Turns validator errors (JSON Pointer paths) into offsets in the document text. Pure: no vscode.
const { parseTree, findNodeAtLocation } = require('jsonc-parser');
const { validateDocument } = require('./validator');

function pointerToSegments(pointer) {
  if (!pointer) return [];
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/** The text span to underline for a pointer: a property's key, else the value (objects: the opening brace). */
function spanFor(tree, pointer) {
  if (!tree) return { start: 0, end: 1 };
  let segs = pointerToSegments(pointer);
  let node = findNodeAtLocation(tree, segs);
  // A disallowed or missing property may not resolve: walk up to the nearest node that exists.
  while (!node && segs.length) {
    segs = segs.slice(0, -1);
    node = findNodeAtLocation(tree, segs);
  }
  if (!node) node = tree;
  if (node.parent && node.parent.type === 'property' && node.parent.children && node.parent.children[0] !== node) {
    const key = node.parent.children[0];
    if (node.type === 'object' || node.type === 'array') return { start: key.offset, end: key.offset + key.length };
  }
  if (node.type === 'object' || node.type === 'array') return { start: node.offset, end: node.offset + 1 };
  return { start: node.offset, end: node.offset + node.length };
}

/**
 * Validate a document's text. Returns { ok, kind, problems: [{ message, path, start, end }] }.
 * @param {string} text
 * @param {object} schema
 */
function problemsFor(text, schema) {
  const r = validateDocument(schema, text);
  if (r.error) {
    const m = /line (\d+), column (\d+)/.exec(r.error);
    let start = 0;
    if (m) {
      const lines = text.split('\n');
      for (let i = 0; i < Number(m[1]) - 1 && i < lines.length; i += 1) start += lines[i].length + 1;
      start += Number(m[2]) - 1;
    }
    return { ok: false, kind: 'invalid', problems: [{ message: r.error, path: '', start, end: Math.min(text.length, start + 1) }] };
  }
  const tree = parseTree(text);
  const problems = [];
  for (const rec of r.recipes) {
    for (const e of rec.errors) {
      const { start, end } = spanFor(tree, e.path);
      problems.push({ message: `${e.path || '(root)'} ${e.message}`, path: e.path, start, end });
    }
  }
  return { ok: r.ok, kind: r.kind, count: r.recipes.filter((x) => x.index !== null || r.kind === 'recipe').length, problems };
}

module.exports = { problemsFor, pointerToSegments, spanFor };
