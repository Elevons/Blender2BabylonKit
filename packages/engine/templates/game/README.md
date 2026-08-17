# {{TITLE}}

Babylon Level Kit game app.

## Run

From the project root (the folder that contains this `game/` directory):

```bash
npm install
npm start                 # opens the Project Control Panel
# or: npx b2bkit-control-panel
```

In the hub, start the Vite game server (or run `npm start` / `npm run dev` inside
`game/`). A spinning cube loads from `public/levels/{{LEVEL}}/` so Start works
immediately — replace that export from Blender when you are ready (Live Link
recommended).

## Blender add-on

```bash
npx b2bkit-addon-path
```

Install that zip via Blender → Preferences → Get Extensions → Install from Disk.
