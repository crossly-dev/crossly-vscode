'use strict';
// Hover docs for recipe files, drawn from the schema itself: hover a trigger, condition or action
// "type" value for its title, description and config keys, or a key for its description.
// Pure functions (no vscode import), so they are unit-tested in plain Node.
const { getLocation, parseTree, findNodeAtLocation } = require('jsonc-parser');

const SLOTS = ['trigger', 'condition', 'action'];

function branchFor(schema, slot, type) {
  const branches = schema?.properties?.[slot]?.oneOf ?? [];
  return branches.find((b) => b?.properties?.type?.const === type) ?? null;
}

function typeLine(s) {
  if (!s) return '';
  if (Object.hasOwn(s, 'const')) return `\`${JSON.stringify(s.const)}\``;
  if (s.enum) return s.enum.map((e) => `\`${JSON.stringify(e)}\``).join(' \\| ');
  if (s.type === 'array' && s.items) return `array of ${typeLine(s.items)}`;
  return s.type ? `\`${s.type}\`` : '';
}

const escapeCell = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Markdown for one trigger/condition/action branch. */
function describeBranch(slot, branch) {
  const type = branch.properties.type.const;
  const lines = [`**${branch.title ?? type}** · ${slot} \`${type}\``, ''];
  if (branch.description) lines.push(branch.description, '');
  const cfg = branch.properties.config;
  if (cfg && cfg.properties && Object.keys(cfg.properties).length) {
    const req = new Set(cfg.required ?? []);
    lines.push('| config | type | |', '|---|---|---|');
    for (const [k, p] of Object.entries(cfg.properties)) {
      lines.push(`| \`${k}\`${req.has(k) ? ' (required)' : ''} | ${escapeCell(typeLine(p))} | ${escapeCell(p.description)} |`);
    }
  } else {
    lines.push('_No config._');
  }
  return lines.join('\n');
}

function describeProperty(name, s, required) {
  const lines = [`**${name}**${required ? ' (required)' : ''} ${typeLine(s)}`.trim()];
  if (s.title && s.title !== name) lines.push('', s.title);
  if (s.description) lines.push('', s.description);
  if (s.minLength !== undefined || s.maxLength !== undefined) lines.push('', `Length ${s.minLength ?? 0} to ${s.maxLength ?? '∞'}.`);
  return lines.join('\n');
}

/**
 * Hover markdown at `offset` in a recipe or bundle document, or null.
 * @param {string} text
 * @param {number} offset
 * @param {object} schema the automation-recipe-v1 schema
 */
function hoverAt(text, offset, schema) {
  const loc = getLocation(text, offset);
  let path = loc.path;
  if (!path.length) return null;
  let prefix = [];
  if (path[0] === 'recipes' && typeof path[1] === 'number') {
    prefix = path.slice(0, 2);
    path = path.slice(2);
  } else if (path[0] === 'recipes' && path.length === 1) {
    return 'A bundle: `{ "schemaVersion": 1, "recipes": [ … ] }`, each entry one automation recipe.';
  }
  if (!path.length) return null;

  if (path.length === 1 && typeof path[0] === 'string') {
    const p = schema.properties?.[path[0]];
    if (!p) return null;
    if (SLOTS.includes(path[0]) && !loc.isAtPropertyKey) return null;
    return describeProperty(path[0], p, (schema.required ?? []).includes(path[0]));
  }

  const slot = path[0];
  if (!SLOTS.includes(slot)) return null;

  const tree = parseTree(text);
  const typeNode = tree ? findNodeAtLocation(tree, [...prefix, slot, 'type']) : undefined;
  const type = typeNode && typeof typeNode.value === 'string' ? typeNode.value : null;
  const branch = type ? branchFor(schema, slot, type) : null;

  if (path.length === 2 && path[1] === 'type') {
    if (loc.isAtPropertyKey) {
      const n = schema.properties[slot].oneOf.length;
      return `**type**: which ${slot} this is. One of ${n} values; hover the value for its documentation.`;
    }
    if (!branch) return type ? `\`${type}\` is not a known ${slot} type.` : null;
    return describeBranch(slot, branch);
  }
  if (!branch) return null;
  if (path.length === 2 && path[1] === 'config') return describeBranch(slot, branch);
  if (path.length === 3 && path[1] === 'config' && typeof path[2] === 'string') {
    const cfg = branch.properties.config;
    const p = cfg?.properties?.[path[2]];
    if (!p) return `\`${path[2]}\` is not a config key of \`${type}\`.`;
    return describeProperty(path[2], p, (cfg.required ?? []).includes(path[2]));
  }
  return null;
}

module.exports = { hoverAt, describeBranch, branchFor, SLOTS };
