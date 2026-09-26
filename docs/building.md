# Building from source

This document covers local development builds and the source submission path used for Mozilla
review.

## Requirements

- Linux, macOS, or Windows
- Node.js 22.13.0 or newer
- npm from the Node.js installation, or a newer version
- Nix when running Mozilla validation with `web-ext`

## Prepare and build

Run the source setup command from the repository root:

```sh
npm run source:setup
```

The setup script checks the Node.js and npm versions, installs dependencies when needed, runs the
linter and tests, builds the extension, and validates its structure.

For a normal development build, run:

```sh
npm install
npm run build
```

The build output is written to `dist/`. The version in `package.json` is copied into
`dist/manifest.json` during the build.

## Load the extension in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose `dist/manifest.json`.

Rebuild the extension after changing the source, then reload it from the debugging page.

## Validate the build

Run the project checks:

```sh
npm run lint
npm run build:release
node tests/e2e/validate-extension.ts
npm test
```

Enter the Nix development shell to run Mozilla's validator:

```sh
nix develop --command web-ext lint --source-dir=dist
```

These are the same checks used by continuous integration.

## Create a release package

Release packaging and versioning are documented in the [release process](release.md).
