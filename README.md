# Video Speed Controller for Firefox

Firefox-focused WebExtension for controlling HTML5 video and audio playback
speed from an on-page controller, keyboard shortcuts, and the extension popup.

This fork is maintained as a Firefox port. It uses Firefox-compatible MV3
packaging, Gecko add-on metadata, Mozilla validation through `web-ext`, and a
Firefox-specific content bridge for page-context playback control.

## Features

- Works with HTML5 `<video>` and `<audio>` elements.
- On-page draggable speed controller.
- Popup controls for quick speed changes.
- Keyboard shortcuts for speed, seek, mute, marker, and display actions.
- Configurable shortcut bindings.
- Per-site enable/disable and per-site default speed rules.
- Optional remembered playback speed across refreshes and sessions.
- Custom controller CSS.
- Built-in Catppuccin palettes with per-flavour and per-accent selection.
- Import and export for the full settings set.
- Saved playback time tracking.

## Theme Defaults

The extension keeps the default controller theme as the safe first-run choice.
Catppuccin is available as the guided theme path, with `mocha` used as the
default flavor when a Catppuccin theme is selected.

## Source Submission

Mozilla asked for source submission with exact build instructions, tool
versions, and a script that performs the technical setup steps. This repo
includes that path.

Required environment:

- Operating system: Linux, macOS, or Windows
- Node.js: `22.13.0` or newer
- npm: the version bundled with that Node.js install, or newer
- Optional for Mozilla validation: Nix with the `web-ext` tool from
  `nix develop`

Step-by-step build:

1. Install Node.js 22.13.0 or newer and confirm `node --version` and
   `npm --version`.
2. Run the setup script:
   ```sh
   npm run source:setup
   ```
3. For Mozilla review validation, run:
   ```sh
   nix develop --command web-ext lint --source-dir=dist
   ```
4. Load `manifest.json` or `dist/manifest.json` from
   `about:debugging#/runtime/this-firefox` for local Firefox testing.

The root manifest points at the built files in `dist/`, and the build also
writes a standalone `dist/manifest.json`.

## Validation

The CI pipeline runs the same checks through the Nix dev shell:

- `npm run lint`
- `npm run build:release`
- `node tests/e2e/validate-extension.ts`
- `nix develop --command web-ext lint --source-dir=dist`
- `npm test`

## Release Notes

Release builds are generated from `dist/`:

```sh
npm run release
```

The resulting zip is written to `release/` and should pass Mozilla validation
before upload.

## Settings Workflow

The options page supports staged imports. Imported settings are loaded into the
form first, then applied only after you press Save. This keeps imports from
silently overwriting the current profile.

## Credits

This project is based on the original
[Video Speed Controller](https://github.com/igrigorik/videospeed) by
Ilya Grigorik and contributors, licensed under the MIT License. This Firefox
fork keeps the original idea and much of the project lineage while adapting the
extension for Firefox WebExtensions.

## License

MIT License. See [LICENSE](LICENSE).
