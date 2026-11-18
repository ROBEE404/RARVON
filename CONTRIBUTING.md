# Bugs, ideas and changes

Rarvon is free to use, but it is not open source: all rights are reserved (see [LICENSE](LICENSE)), and changes are
made only by its maintainer, ROBEE. Pull requests are not accepted.

You can still help a lot:

- **Report a bug:** open an issue with what you did, what you expected, and what happened (browser and device
  help too).
- **Ask for a tool:** open an issue describing the job you want to do and the files involved.
- **Security problems:** see [SECURITY.md](SECURITY.md).

---

## Maintainer notes

### Adding a tool

1. Create `src/tools/<category>/<slug>/index.tsx` with a default-exported component.
2. Add its metadata (name, description, keywords, **actions**, status) to `src/lib/toolRegistry.ts`.
   Pick 1–3 entries from `ToolAction` (`convert`, `compress`, `edit`, `resize`, `extract`,
   `generate`, `optimize`, `analyze`) that describe the user's actual intent — this is what makes
   global search group "compress" across Image/Video/PDF/Audio together, so it's not optional
   metadata. Run `npx tsx scripts/verify-search.ts` after adding a tool to sanity-check it shows up
   for the queries you'd expect.
3. Register it in `src/lib/toolComponents.tsx` as a lazy import.
4. If it's genuinely impossible to run client-side, set `status: 'coming-soon'` and give a real,
   specific `comingSoonReason` — never a fake button or a silent upload.

### Ground rules

- **No uploads.** If a tool touches user files, it processes them in the browser. If that's not
  possible, it's Coming Soon, not faked.
- **No dark patterns.** No donation nags, no fake urgency, no gating basic tools.
- **Keep the homepage light.** Don't import a tool's processing library outside its own folder.
- **Check licenses.** Rarvon is closed source, so a new dependency must allow use in a closed product
  (MIT, Apache-2.0, BSD, ISC, MPL-2.0 unmodified, or LGPL loaded as a separate replaceable file) and
  must be added to the credits.
- **Keep the Privacy page true.** If a change affects what Rarvon stores or loads, update `/privacy`
  and its date in the same change.
