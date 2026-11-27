# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-27

### Added

- JSON Schema validation and completion for Crossly automation recipes (`*.crossly-recipe.json`, `crossly-recipes/recipes/**/*.json`) and recipe bundles (`*.crossly-recipes.json`, `crossly-recipes/recipes/all.json`), from the bundled `automation-recipe-v1.json`.
- **Crossly: Validate Recipe** command and validation on open and save, with "did you mean" suggestions for mistyped types and keys, also for bundles.
- Hover documentation for every trigger, condition and action type and its config keys, from the schema.
- Snippets: `crossly-recipe`, `crossly-recipe-condition`, `crossly-bundle`, `crossly-trigger`, `crossly-condition`, `crossly-action`.

[0.1.0]: https://github.com/crossly-dev/crossly-vscode/releases/tag/v0.1.0
