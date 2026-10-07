# Third-party notices — assets/ghostty

## t3code ghostty web adapter

`ghostty.mjs` is bundled from the browser adapter at
`apps/web/src/terminal/ghostty` in [t3code](https://github.com/t3dotgg/t3code)
(MIT, T3 Tools Inc). Regenerate with `bun app/scripts/rebuild-ghostty.mjs`
against a t3code checkout (`T3CODE_DIR` overrides the default path).

## Ghostty / libghostty-vt

`ghostty-vt.wasm` and `ghostty-write-pty.wasm` are reproducible builds of
[libghostty-vt](https://github.com/ghostty-org/ghostty) (MIT) produced by
t3code's `apps/web/scripts/build-libghostty-wasm.sh`.

- Vendored revision: `9f62873bf195e4d8a762d768a1405a5f2f7b1697`

## Symbols Nerd Font Mono

`SymbolsNerdFontMono-Regular.woff2` is the symbols-only Nerd Font (MIT),
vendored so prompt glyphs render without a locally installed Nerd Font.
