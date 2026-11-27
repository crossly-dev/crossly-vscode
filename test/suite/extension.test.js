'use strict';
// Runs inside a real VS Code with the extension loaded, against test/fixtures/workspace.
const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const ws = path.resolve(__dirname, '..', 'fixtures', 'workspace');
const open = async (name) => {
  const doc = await vscode.workspace.openTextDocument(path.join(ws, name));
  await vscode.window.showTextDocument(doc);
  return doc;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(250);
  }
}
const crossly = (uri) => vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'crossly');

suite('Crossly extension', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'crossly' && e.packageJSON.publisher === 'crossly');
    assert.ok(ext, 'extension is loaded');
    await ext.activate();
  });

  test('commands are registered', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(all.includes('crossly.validateRecipe'));
    assert.ok(all.includes('crossly.openSchema'));
  });

  test('a bad recipe gets "did you mean" diagnostics on open', async () => {
    const doc = await open('bad.crossly-recipe.json');
    const diags = await waitFor(() => crossly(doc.uri).length && crossly(doc.uri), 'crossly diagnostics');
    const typo = diags.find((d) => /did you mean "listing\.sold"/.test(d.message));
    assert.ok(typo, diags.map((d) => d.message).join('\n'));
    assert.strictEqual(doc.getText(typo.range), '"listing.sol"');
    assert.ok(diags.some((d) => d.message.startsWith('/enabled')));
  });

  test('the contributed JSON schema is applied by VS Code itself', async () => {
    const doc = await open('bad.crossly-recipe.json');
    await waitFor(() => vscode.languages.getDiagnostics(doc.uri).some((d) => d.source !== 'crossly'), 'JSON language service diagnostics');
  });

  test('the validate command passes a good recipe and fails a bad bundle', async () => {
    await open('good.crossly-recipe.json');
    const good = await vscode.commands.executeCommand('crossly.validateRecipe');
    assert.strictEqual(good.ok, true);
    const bundle = await open('bundle.crossly-recipes.json');
    const bad = await vscode.commands.executeCommand('crossly.validateRecipe');
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.kind, 'bundle');
    assert.ok(crossly(bundle.uri).some((d) => d.message.startsWith('/recipes/1/name')));
  });

  test('hover on a trigger type shows its docs', async () => {
    const doc = await open('good.crossly-recipe.json');
    const pos = doc.positionAt(doc.getText().indexOf('"listing.sold"') + 3);
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, pos);
    const text = hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n');
    assert.match(text, /trigger `listing\.sold`/);
  });

  test('snippets are contributed for JSON', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'json', content: '' });
    await vscode.window.showTextDocument(doc);
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(0, 0));
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(labels.some((l) => l === 'crossly-recipe'), labels.slice(0, 30).join(', '));
  });
});
