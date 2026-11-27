'use strict';
// Crossly for VS Code: recipe schema validation, "did you mean" diagnostics, hover docs, snippets.
const vscode = require('vscode');
const path = require('path');
const schema = require('../schemas/automation-recipe-v1.json');
const { SCHEMA_URL } = require('./validator');
const { problemsFor } = require('./problems');
const { hoverAt } = require('./hover');

const SELECTOR = [
  { language: 'json', scheme: 'file' },
  { language: 'jsonc', scheme: 'file' },
  { language: 'json', scheme: 'untitled' },
  { language: 'jsonc', scheme: 'untitled' },
];

/** Is this a Crossly recipe (or recipe bundle) file? */
function isRecipeDocument(doc) {
  if (!['json', 'jsonc'].includes(doc.languageId)) return false;
  const file = doc.uri.path;
  const base = path.posix.basename(file);
  if (base.endsWith('.crossly-recipe.json') || base.endsWith('.crossly-recipes.json')) return true;
  if (/\/crossly-recipes\/recipes\//.test(file)) return true;
  const head = doc.getText(new vscode.Range(0, 0, 20, 0));
  return head.includes(SCHEMA_URL);
}

function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection('crossly');
  context.subscriptions.push(collection);

  function check(doc) {
    const result = problemsFor(doc.getText(), schema);
    collection.set(
      doc.uri,
      result.problems.map((p) => {
        const d = new vscode.Diagnostic(new vscode.Range(doc.positionAt(p.start), doc.positionAt(p.end)), p.message, vscode.DiagnosticSeverity.Error);
        d.source = 'crossly';
        return d;
      }),
    );
    return result;
  }

  const enabled = () => vscode.workspace.getConfiguration('crossly').get('validateOnSave', true);

  context.subscriptions.push(
    vscode.commands.registerCommand('crossly.validateRecipe', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Crossly: open a recipe JSON file first.');
        return undefined;
      }
      const r = check(editor.document);
      if (r.ok) {
        vscode.window.showInformationMessage(r.kind === 'bundle' ? `Crossly: valid bundle of ${r.count} recipe${r.count === 1 ? '' : 's'}.` : 'Crossly: valid recipe.');
      } else {
        vscode.window.showErrorMessage(`Crossly: ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}. See the Problems panel.`);
      }
      return r;
    }),
    vscode.commands.registerCommand('crossly.openSchema', () => vscode.env.openExternal(vscode.Uri.parse(SCHEMA_URL))),
    vscode.workspace.onDidSaveTextDocument((doc) => enabled() && isRecipeDocument(doc) && check(doc)),
    vscode.workspace.onDidOpenTextDocument((doc) => enabled() && isRecipeDocument(doc) && check(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    vscode.workspace.onDidChangeTextDocument((e) => collection.has(e.document.uri) && collection.delete(e.document.uri)),
    vscode.languages.registerHoverProvider(SELECTOR, {
      provideHover(doc, position) {
        if (!isRecipeDocument(doc)) return undefined;
        const md = hoverAt(doc.getText(), doc.offsetAt(position), schema);
        return md ? new vscode.Hover(new vscode.MarkdownString(md)) : undefined;
      },
    }),
  );

  for (const doc of vscode.workspace.textDocuments) if (enabled() && isRecipeDocument(doc)) check(doc);
}

function deactivate() {}

module.exports = { activate, deactivate, isRecipeDocument };
