# Running Rarvon on your computer

Rarvon is ROBEE's closed-source project (see `LICENSE`). This guide takes you from the zip to a running
Rarvon in about five minutes.

## 1. Install Node.js (once)

1. Go to https://nodejs.org and download the **LTS** version (22 or newer).
2. Run the installer and keep the default options.
3. Check it worked: open **PowerShell** (Start menu → type "PowerShell") and run:

   ```bash
   node --version
   ```

   You should see something like `v22.15.0`.

## 2. Unzip the project

1. Right-click `Rarvon-project-0.1.0.zip` → **Extract All…** → choose a folder, for example
   `C:\Projects\`.
2. You now have a folder called `Rarvon`.
3. Open PowerShell **in that folder**: open the `Rarvon` folder in File Explorer, click the address bar,
   type `powershell`, and press Enter.

## 3. Install the libraries (once, about 20 seconds)

```bash
npm ci
```

You may see "vulnerabilities" warnings. They're about build tools only, nothing that reaches visitors;
don't run `npm audit fix --force`.

## 4. Run Rarvon

**Option A, while developing** (the page updates as soon as you change a file):

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. Press `Ctrl+C` in PowerShell to stop it.

**Option B, the real website, exactly as visitors will get it:**

```bash
npm run build
```

```bash
npx vite preview
```

Open **http://localhost:4173**. The first build also downloads the Background Remover's AI models
(about 125 MB) into `ai-models\`; later builds reuse them. The finished website is in the `dist\` folder,
ready for any host.

## 5. Run the tests

Unit tests (about 10 seconds):

```bash
npx vitest run
```

Browser tests: install the test browser once, then run them (about 5 minutes, 171 tests):

```bash
npx playwright install chromium
```

```bash
npx playwright test
```

## 6. The desktop app (Windows)

To **use** the app, run the installer `Rarvon-setup-0.1.0.exe` (it isn't inside this zip, because of its
size; it's in `desktop\out\` on the computer it was built on).

To **build** the app yourself, you also need:
- [Rust](https://rustup.rs);
- [Inno Setup 6](https://jrsoftware.org/isinfo.php);
- FFmpeg (the LGPL build; `desktop\README.md` says exactly which file and where it goes).

Then:

```bash
npm run build:desktop
```

The installer appears in `desktop\out\`. The desktop app's own tests:

```bash
npm run test:desktop
```

## 7. The logo files

The complete logo package (SVG, PNG from 16 to 1024 px, Windows `.ico`, full logos for light and dark,
colours and a guide) is in `design\brand\rarvon-final\`.

## 8. Settings for publishing

Copy `.env.example` to `.env` and fill in what you need: the Ko-fi link, the feedback email, the GitHub
link, and the app download links. Each button stays hidden until its link is set. Then run
`npm run build` again.

## If something goes wrong

| Problem | Fix |
|---|---|
| `npm` or `node` is "not recognized" | Close and reopen PowerShell after installing Node.js |
| Port 5173 is already in use | Something else is running there; close it, or run `npm run dev -- --port 5180` |
| The AI model download fails during `npm run build` | Check your internet connection and run it again; finished files are kept |
| A browser test fails on the first run | Run `npx playwright install chromium` once, then try again |
