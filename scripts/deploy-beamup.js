const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { syncGithubKeys } = require('beamup-cli/lib/ssh');

const HOST = 'a.baby-beamup.club';
const GITHUB_USER = 'FreakForest';
const PROJECT = 'mcu-timeline-stremio-addon';

function hashUser(value) {
  return crypto
    .createHash('sha256')
    .update(`${value.toLowerCase()}\n`)
    .digest('hex')
    .slice(0, 12);
}

function publicBaseDomain(host) {
  const parts = host.split('.');
  return parts.length === 4 ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}

const accountHash = hashUser(GITHUB_USER);
const remoteUrl = `dokku@${HOST}:${accountHash}/${PROJECT}`;
const projectHost = `${accountHash}-${PROJECT}.${publicBaseDomain(HOST)}`;
const manifestUrl = `https://${projectHost}/manifest.json`;

function runGit(args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`Kunne ikke starte git: ${result.error.message}`);
    process.exit(1);
  }
  if (!allowFailure && result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  return result;
}

function ensureRepository() {
  const root = runGit(['rev-parse', '--show-toplevel'], { capture: true, allowFailure: true });
  if (root.status !== 0) {
    console.error('Kør kommandoen inde i det klonede mcu-timeline-stremio-addon repository.');
    process.exit(1);
  }

  const status = runGit(['status', '--porcelain'], { capture: true });
  if ((status.stdout || '').trim()) {
    console.error('Repository har lokale ændringer. Commit/stash dem først, så BeamUp får en entydig version.');
    process.exit(1);
  }
}

function configureRemote() {
  const current = runGit(['remote', 'get-url', 'beamup'], { capture: true, allowFailure: true });
  if (current.status === 0) {
    if ((current.stdout || '').trim() !== remoteUrl) {
      runGit(['remote', 'set-url', 'beamup', remoteUrl]);
    }
  } else {
    runGit(['remote', 'add', 'beamup', remoteUrl]);
  }
}

async function main() {
  ensureRepository();

  console.log('Synkroniserer dine offentlige GitHub SSH-nøgler med BeamUp…');
  try {
    await syncGithubKeys({ host: HOST, githubUsername: GITHUB_USER });
  } catch (error) {
    console.error('BeamUp kunne ikke synkronisere GitHub SSH-nøgler.');
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }

  configureRemote();

  console.log('Deployer den aktuelle commit til BeamUp…');
  const gitSshCommand = 'ssh -o StrictHostKeyChecking=accept-new';

  const result = spawnSync('git', ['push', '--force', 'beamup', 'HEAD:master'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, GIT_SSH_COMMAND: gitSshCommand },
  });

  if (result.error || result.status !== 0) {
    console.error('\nDeployment fejlede. Den mest almindelige årsag er, at denne PC ikke har en SSH-nøgle, der er tilføjet til GitHub-kontoen FreakForest.');
    console.error('Tjek med: ssh -T -l git github.com');
    process.exit(result.status || 1);
  }

  console.log('\nBeamUp deployment gennemført.');
  console.log(`Manifest: ${manifestUrl}`);
  console.log(`Installer i Stremio med: ${manifestUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
