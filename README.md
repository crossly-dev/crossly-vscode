# Crossly for VS Code

[![ci](https://github.com/crossly-dev/crossly-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-vscode/actions/workflows/ci.yml) [![release](https://github.com/crossly-dev/crossly-vscode/actions/workflows/release.yml/badge.svg)](https://github.com/crossly-dev/crossly-vscode/actions/workflows/release.yml) [![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/crossly-dev/crossly-vscode/blob/main/LICENSE)

Write [Crossly](https://crossly.net) automation recipes with the editor checking them as you type. A recipe is a JSON rule (a trigger, an optional condition, an action) that you can import into Crossly or share in [crossly-dev/crossly-recipes](https://github.com/crossly-dev/crossly-recipes). This extension knows the published schema, [`automation-recipe-v1.json`](https://crossly.net/schemas/automation-recipe-v1.json): all 29 triggers, 7 conditions and 42 actions.

## Features

- **Validation and completion.** Files named `*.crossly-recipe.json`, and any `.json` under `crossly-recipes/recipes/`, are validated against the recipe schema, with completion for every `type` and config key. Bundles (`{ "schemaVersion": 1, "recipes": [ … ] }`, in `*.crossly-recipes.json` or `crossly-recipes/recipes/all.json`) are validated entry by entry. A file with `"$schema": "https://crossly.net/schemas/automation-recipe-v1.json"` gets the same treatment wherever it is.
- **Crossly: Validate Recipe.** Runs on open and save, or from the Command Palette on any JSON file. Problems land in the Problems panel at the exact token, with "did you mean" suggestions for mistyped types and keys (`"listing.sol"` → `listing.sold`).
- **Hover docs.** Hover a trigger, condition or action `type` to see what it does and its config keys; hover a key for its description. All of it comes from the schema, so it is always the same as what Crossly accepts.
- **Snippets.** `crossly-recipe`, `crossly-recipe-condition`, `crossly-bundle`, and `crossly-trigger` / `crossly-condition` / `crossly-action` with a pick list of every type.

## Install

From the Visual Studio Marketplace or Open VSX, search for **Crossly** (publisher `crossly`). Or download the `.vsix` from the [latest release](https://github.com/crossly-dev/crossly-vscode/releases/latest) and run:

```sh
code --install-extension crossly-0.1.0.vsix
```

Every release `.vsix` has [build provenance](https://github.com/crossly-dev/crossly-vscode/attestations); check it before installing with:

```sh
gh attestation verify crossly-0.1.0.vsix -R crossly-dev/crossly-vscode
```

## Settings

| Setting | Default | |
|---|---|---|
| `crossly.validateOnSave` | `true` | Validate recipe files when they are opened or saved. |

## Using your recipes

Import a recipe or a bundle into your account with the CLI (`crossly automation import-recipes --payload <file>`) or the `import_automation_recipes` MCP tool; the [Crossly docs](https://crossly.net/docs/api-automation) cover the API. This extension never talks to the network or to your account: validation, hovers and snippets all work offline from the bundled schema.

## Development

```sh
npm install
npm test                    # unit tests (plain Node): validator vs Ajv, hovers, diagnostics, snippets
npm run test:integration    # inside a real VS Code (on Linux: xvfb-run -a npm run test:integration)
node scripts/gen-snippets.js
npx vsce package
```

CI runs all of it on every push, plus weekly to catch the live schema changing.

## Related

- [crossly-playground](https://crossly-dev.github.io/crossly-playground/): validate a recipe, check a webhook signature, inspect a token, in the browser
- [crossly-skills](https://github.com/crossly-dev/crossly-skills): Claude Code plugin for the Crossly API
- [crossly-ai-rules](https://github.com/crossly-dev/crossly-ai-rules): rules for AI coding agents

## License

[MIT](https://github.com/crossly-dev/crossly-vscode/blob/main/LICENSE)
