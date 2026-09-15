const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const { ensureFresh } = require('./official-data');

const port = Number(process.env.PORT || 7000);
serveHTTP(addonInterface, { port });
console.log(`MCU Timeline addon kører på port ${port}`);
console.log(`Manifest lokalt: http://127.0.0.1:${port}/manifest.json`);

// Warm the official cache after startup without delaying the server.
ensureFresh({ force: true }).catch(() => {});
