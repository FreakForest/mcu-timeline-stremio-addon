# MCU Timeline – Official Chronology for Stremio

A metadata/catalog-only Stremio add-on that follows Marvel/Disney+'s **official MCU Complete Timeline**. It provides no streams, torrents, or playback sources.

## What it does

- Shows the official MCU chronology with one global sequence number.
- Splits movies/specials and series into separate Stremio catalogs because Stremio catalogs have a fixed content type.
- Creates season-specific cards for shows that appear more than once in the official timeline.
- Uses Cinemeta metadata so normal Stremio metadata and existing stream add-ons can continue to work.
- Checks Marvel's official **“See the Complete MCU Timeline on Disney+”** page at most once every 24 hours.
- Automatically follows official additions or reorderings when Marvel updates that page.
- Never guesses a title into the main chronology.
- Falls back to the bundled last-known official snapshot if Marvel cannot be reached or its page layout changes.

Official timeline source:

https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus

## Catalogs

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

## Deploy to BeamUp

Stremio's Addon SDK recommends BeamUp for hosted add-ons.

Prerequisites on the computer used for the first deployment:

- Node.js
- Git
- a GitHub account
- an SSH key registered with GitHub

Install and configure BeamUp:

```bash
npm install -g beamup-cli
beamup config
```

When asked for a BeamUp host, use:

```text
a.baby-beamup.club
```

Then, from this repository:

```bash
npm install
npm run check
beamup
```

The app already listens on `process.env.PORT`, as required by BeamUp.

BeamUp will return a public HTTPS URL. The Stremio installation URL is:

```text
https://YOUR-BEAMUP-HOST/manifest.json
```

## Publish to Stremio's public catalog

After the BeamUp URL is live and `/manifest.json` is reachable:

```bash
ADDON_URL=https://YOUR-BEAMUP-HOST/manifest.json npm run publish
```

`publish.js` uses the official SDK's `publishToCentral()` helper.

## Automatic updates

The server checks the official Marvel timeline when its cache is older than 24 hours. You can override the interval with:

```text
MARVEL_REFRESH_MS=86400000
```

The minimum supported value is one hour, to avoid hammering Marvel's site.

If Marvel's site is temporarily unavailable, the add-on keeps serving the last valid in-memory data. After a restart it can always fall back to `timeline.snapshot.js`.

## Data / stream policy

This add-on is deliberately metadata-only. It contains no piracy sources and does not bypass any streaming service. Playback availability is determined by the user's other Stremio add-ons and legitimate services.
