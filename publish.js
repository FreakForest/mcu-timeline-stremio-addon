const { publishToCentral } = require('stremio-addon-sdk');

const raw = process.env.ADDON_URL || process.argv[2];
if (!raw) {
  console.error('Mangler ADDON_URL. Eksempel: ADDON_URL=https://example.com/manifest.json npm run publish');
  process.exit(1);
}

const manifestUrl = raw.endsWith('/manifest.json')
  ? raw
  : `${raw.replace(/\/$/, '')}/manifest.json`;

console.log(`Publicerer ${manifestUrl} til Stremios centrale add-on-katalog...`);
Promise.resolve(publishToCentral(manifestUrl))
  .then((result) => {
    console.log('Stremio-svar:', result || 'OK');
  })
  .catch((error) => {
    console.error('Publicering fejlede:', error && error.message ? error.message : error);
    process.exit(1);
  });
