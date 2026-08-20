# Facebook Comment Finder (Post Finder Pro)

Chrome Extension (Manifest V3) written in TypeScript and Tailwind CSS with Bun.

## Setup & Development

### Install Dependencies
```bash
bun install
```

### Build Extension to `dist/`
```bash
bun run build
```

### Type Checking
```bash
bun run typecheck
```

### CSS Watch Mode
```bash
bun run dev:css
```

## Loading into Chrome
1. Run `bun run build` to generate the `dist/` bundle.
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle).
4. Click **Load unpacked** and select the [`dist`](file:///root/WORK/Post-Finder-Pro/dist) directory.
