# MCU Timeline – Official Chronology for Stremio

A metadata/catalog-only Stremio add-on that follows Marvel/Disney+'s **official MCU Complete Timeline**. It provides no streams, torrents, or playback sources.

## What it does

- Shows the official MCU chronology with one global sequence number.
- Provides a combined `MCU Timeline • Alt` catalog containing movies, specials, and series in the official chronological order.
- Also provides separate movies/specials and series catalogs as optional filtered views.
- Creates season-specific cards for shows that appear more than once in the official timeline.
- Uses Cinemeta metadata so normal Stremio metadata and existing stream add-ons can continue to work.
- Checks Marvel's official **“See the Complete MCU Timeline on Disney+”** page at most once every 24 hours.
- Automatically follows official additions or reorderings when Marvel updates that page.
- Never guesses a title into the main chronology.
- Falls back to the bundled last-known official snapshot if Marvel cannot be reached or its page layout changes.

Official timeline source:

https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus

## Catalogs

- `MCU Timeline • Alt`
- `MCU Timeline • Film & Specials`
- `MCU Timeline • Serier`
- `MCU • Kommende film`
- `MCU • Kommende serier`

The number on each timeline card is the title's position in Marvel/Disney+'s complete timeline.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

Manifest:

```text
http://127.0.0.1:7000/manifest.json
```

Stremio requires HTTPS for remote add-ons; `127.0.0.1` is the local exception.

## Deploy + publish in one command

Stremio's Addon SDK recommends BeamUp for hosted add-ons. This repository includes an end-to-end helper, so no manual BeamUp configuration or separate Stremio publication command is needed.

Prerequisites on the computer used for the first deployment:

- Node.js 20+
- Git
- OpenSSH (included in current Windows versions)
- an SSH key whose public key is registered on the GitHub account `FreakForest`

From a clone of this repository, run:

```bash
npm install
npm run deploy:all
```

`deploy:all` automatically:

1. syntax-checks the project;
2. syncs the public SSH keys from the `FreakForest` GitHub account with BeamUp;
3. configures the correct `beamup` git remote;
4. deploys the current commit to BeamUp;
5. waits for the public HTTPS manifest to become available and validates its add-on ID;
6. publishes the verified manifest to Stremio Community Add-ons via the official SDK `publishToCentral()` helper.

No private SSH key is uploaded by the helper. Git/SSH uses the key already stored on your computer.

Expected public manifest after a successful deployment:

```text
https://0f9587522331-mcu-timeline-stremio-addon.baby-beamup.club/manifest.json
```

The app listens on `process.env.PORT`, as required by BeamUp.

### Deploy only

If you do not want to publish to the Community Add-ons catalog yet:

```bash
npm run deploy:beamup
```

## Automatic updates

The server checks the official Marvel timeline when its cache is older than 24 hours. You can override the interval with:

```text
MARVEL_REFRESH_MS=86400000
```

The minimum supported value is one hour, to avoid hammering Marvel's site.

If Marvel's site is temporarily unavailable, the add-on keeps serving the last valid in-memory data. After a restart it can always fall back to `timeline.snapshot.js`.

## Data / stream policy

This add-on is deliberately metadata-only. It contains no piracy sources and does not bypass any streaming service. Playback availability is determined by the user's other Stremio add-ons and legitimate services.

## Disclaimer / AI assistance

This project was created with significant assistance from **ChatGPT by OpenAI**, including help with research, code generation, debugging, documentation, and deployment setup. The project is maintained and published by `FreakForest`.

This is an unofficial fan-made project and is not affiliated with, endorsed by, or sponsored by Marvel, Disney, Stremio, or OpenAI. All trademarks and names belong to their respective owners.
