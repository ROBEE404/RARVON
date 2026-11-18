# Rarvon in Figma

Every Rarvon screen as it looks today, taken from the real site and app, with arrows showing which button
leads where.

## What's in the pack

| Folder | What it is |
|---|---|
| `flow-sheets/` | One SVG per flow and theme (32). Screens in order, each arrow labelled with its button, the other buttons listed under each screen. |
| `01-finding-tools/` … `16-arabic/` | Every screen as a full-length PNG, numbered in flow order. |
| `01-finding-tools-dark/` … `16-arabic-dark/` | The same screens in the dark theme. |

Flows 01–12 are the website on a desktop (1440 px wide), 13 is the website once the app download link is
set, 14 is Rarvon for desktop, 15 is the phone and 16 is Arabic. Every flow is there twice: light and dark.

## Bring it into Figma

1. Open Figma (figma.com or the Figma app) and create a new design file.
2. **Flow sheets:** drag the SVG files from `flow-sheets/` onto the canvas. Each becomes a frame you can
   edit: the screens are images, and the arrows and text are real layers you can move, restyle or retype.
3. **Single screens:** drag PNGs from a numbered folder onto the canvas. In Figma, select one and press
   `Ctrl+Alt+G` (Mac: `Cmd+Option+G`) to put it in a frame if you want to draw on top of it.
4. Optional: in Figma's prototype mode, connect the frames along the arrows to click through the flow.

## Editable layers from the live site (later)

The screenshots are pictures. To get Rarvon's pages as real Figma layers (text, buttons, colours), use the
free **html.to.design** plugin in Figma once the site is online: give it a page address (for example
`https://<your-site>/tools/image/convert`) and it imports the page as editable layers.

## Refreshing the pictures

The pictures come from a script, so the map can be redone after any change:

```bash
npm run build
```

```bash
npm run design:capture
```

```bash
npm run design:pack
```

`design:capture` photographs every screen (it needs the desktop engine built, see `desktop/README.md`).
`design:pack` makes this pack again in `design/out/`.
