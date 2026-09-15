const path = require('path');
const { spawnSync } = require('child_process');
const { publishToCentral } = require('stremio-addon-sdk');

const MANIFEST_URL = 'https://0f9587522331-mcu-timeline-stremio-addon.beamup.club/manifest.json';
const EXPECTED_ID = 'com.freakforest.mcutimeline';

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    console.error(`Kunne ikke starte Node.js: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runChecks() {
  const files = [
    'addon.js',
    'official-data.js',
    'server.js',
    'publish.js',
    path.join('scripts', 'deploy-beamup.js'),
    path.join('scripts', 'deploy-and-publish.js'),
  ];

  for (const file of files) {
    runNode(['--check', file]);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForManifest() {
  console.log(`Venter på at BeamUp bliver klar: ${MANIFEST_URL}`);
  let lastError;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(MANIFEST_URL, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();

      if (manifest.id !== EXPECTED_ID) {
        throw new Error(`Uventet add-on ID: ${manifest.id || '(mangler)'}`);
      }

      console.log(`Manifest er online: ${manifest.name} v${manifest.version}`);
      return manifest;
    } catch (error) {
      lastError = error;
      process.stdout.write(`Forsøg ${attempt}/30 – ikke klar endnu\r`);
      await sleep(4000);
    }
  }

  throw new Error(`BeamUp-manifest blev ikke klar i tide: ${lastError && lastError.message ? lastError.message : lastError}`);
}

async function main() {
  console.log('1/4 Kontrollerer projektet…');
  runChecks();

  console.log('2/4 Deployer til BeamUp…');
  runNode([path.join('scripts', 'deploy-beamup.js')]);

  console.log('3/4 Verificerer det offentlige Stremio-manifest…');
  await waitForManifest();

  console.log('4/4 Publicerer til Stremio Community Add-ons…');
  const result = await publishToCentral(MANIFEST_URL);
  console.log('Stremio publish-svar:', result || 'OK');
  console.log('\nFærdig. Add-on URL:');
  console.log(MANIFEST_URL);
}

main().catch(error => {
  console.error('\nDeploy/publicering fejlede:');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
