# BACKLOG

A dark, black-and-white platformer built on **LUX** (formerly AIUX), the ServiceNow UI framework. Built for the AIUX Game Challenge started by Nathan Firth.

A support analyst with a headset wakes up inside an abandoned ServiceNow instance. One ticket is still open. Reach the **Resolved** door before the SLA catches up.

## What is in it

- **Level 1, "The Queue"** (1 to 2 minutes): push a ticket crate to climb a rack wall, jump a cable pit, pull the approval lever and slip through the gate, time three presses over a conveyor, then outrun a giant shadow with a clock for a face.
- **Procedural sound**: generated in the browser with the Web Audio API. There are no audio files.
- **Leaderboard**: finished runs are saved to a table on the ServiceNow instance and shown as a top 10 on the final screen and on the Ranking page.
- **Engine**: plain Canvas 2D with a fixed 120 Hz physics step. No game library.

### Controls

| Action | Keys |
|---|---|
| Move | `A` / `D` or arrow keys |
| Jump | `W`, `Up` or `Space` |
| Pull lever | `E` or `Shift` |
| Restart | `R` |
| Mute | `M` |

## Requirements

- Node.js **24.14.1 or newer** (see `.nvmrc`)
- pnpm **10**
- Git
- A ServiceNow instance you can sign in to as an admin, on a release that supports LUX (developed on **Brazil**)

## Install

```bash
git clone https://github.com/douglasmborges/backlog.git
cd backlog
pnpm install
```

The first install takes a few minutes because the LUX packages are large.

### Use your own scope

The app scope `x_2302769_backlog` carries the company code of the instance it was built on. On another instance, read your own code from the system property `glide.appcreator.company.code`, then replace `x_2302769` with `x_<your code>` everywhere it appears:

```bash
grep -rn "x_2302769" --exclude=pnpm-lock.yaml --exclude-dir=node_modules .
```

This affects `now.config.json`, the page and component tag names, `pages/play/components/ranking-api.js` and `src/fluent/tables/score.now.ts`. The scope can be 18 characters at most. Do not change it after the first install, or the instance will end up with a duplicate app.

`now.config.json` also holds a `scopeId`, the sys_id of the app record on the instance it was built on. It is not a secret, but it belongs to that instance: on yours, let the SDK create the app, or replace it with your own.

## Run locally

Connect the SDK to your instance, then start the local LUX server. It runs the whole app on your machine and talks to the instance for login and for the leaderboard table.

```bash
pnpm exec now-sdk auth --add https://<your-instance>.service-now.com --type basic --alias dev
pnpm exec now-sdk auth --list
```

**macOS / Linux**

```bash
PORT=8080 pnpm dev
```

**Windows (PowerShell)**

```powershell
$env:PORT=8080; pnpm dev
```

When you see `listening on http://localhost:8080`, open <http://localhost:8080/aiux/backlog/play>, sign in with your ServiceNow user, click the game and press `Enter`.

Notes:

- The server listens on port 80 by default, which needs administrator rights. `PORT=8080` avoids that.
- The hot-reload socket uses port 3101. If you see `EADDRINUSE ... 3101`, another `pnpm dev` is still running.
- Some 404s on `/sncapps/...` and chat errors in the browser console come from the instance and do not affect the game.

## Deploy to the instance

```bash
pnpm build
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`: the second one is a built-in pnpm command that only works inside a workspace and fails here.

`pnpm run deploy` runs `now-sdk install`, which creates the app, its pages and the `x_2302769_backlog_score` table with two ACLs (any signed-in user can read and create scores). It prints a rollback URL: keep it, because opening it undoes the install.

**Known limitation:** the install can succeed and the pages can still fail to open at `https://<your-instance>/aiux/backlog/play`. On the PDI used to build this project (release Brazil), the LUX service was not active: files under `/sncapps/aix/assets/` returned 404 and `/aiux/health` did not answer, which also broke the app that ships with the instance. If you see "Core scripts failed to load!", use the local server above. Check `https://<your-instance>/aiux/health` before blaming the code.

## Project layout

```
backlog/
├── aiux.json                    # LUX manifest: name, URL basename, landing route
├── now.config.json              # ServiceNow scope settings
├── application.js               # Navigation shell (Play, Ranking)
├── theme.js                     # Theme tokens
├── pages/
│   ├── play/
│   │   ├── page.js              # Route /play
│   │   └── components/
│   │       ├── backlog-game.js  # UI: title, HUD, final screen, leaderboard
│   │       ├── engine.js        # Physics, level logic, rendering
│   │       ├── level.js         # Level layout and constants
│   │       ├── sound.js         # Web Audio sound effects and ambience
│   │       └── ranking-api.js   # Reads and writes the score table
│   └── ranking/page.js          # Route /ranking
├── src/fluent/tables/score.now.ts   # Leaderboard table and ACLs (Fluent)
└── tools/simulate-playthrough.mjs   # Headless bot that finishes the level
```

## Edit the level

Everything about the layout lives in `pages/play/components/level.js`: solids, spikes, the lever and gate, the conveyor, the three presses, the chase and the checkpoints. After a change, run the bot to confirm the level can still be finished:

```bash
node tools/simulate-playthrough.mjs
```

It runs the real engine without a browser. A successful run ends with a line like `WON: {"timeMs":19050,"deaths":0}`.

## Security

- This repository contains **no credentials**. Your instance URL, user name and password are stored by the SDK on your machine (`now-sdk auth`), never in the project.
- `.env` files and the `.now/` build folder are ignored by Git. Do not commit them.
- Use a development instance (a PDI), not production. The app creates a table and ACLs and uses your admin session to install.
- The leaderboard is open by design: any signed-in user can add a score, and the game sends the time and number of deaths from the browser. Do not treat it as tamper-proof.

## Credits

The challenge is Nathan Firth's [AIUX Game Challenge](https://www.linkedin.com/pulse/aiux-game-challenge-nathan-firth-bqv3c/). Game by Douglas Borges.

## License

No license is granted. The code is public to read, but all rights are reserved. Open an issue if you want to reuse it.
