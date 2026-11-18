import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const server = readFileSync('server.ts', 'utf8');
const requiredServerControls = [
  ["ENABLE_EXPRESS_COMPAT_SERVER !== 'true'", 'Express compatibility server must be opt-in'],
  ["const host = '127.0.0.1'", 'Express compatibility server must bind to loopback only'],
  ['createIpRateLimiter(300, 60_000)', 'Express compatibility server must have a global IP limiter'],
  ["express.json({ limit: '64kb', strict: true })", 'Express JSON bodies must be bounded and strict'],
  ["import('./server/routes')", 'Legacy business routes must load only after the opt-in guard'],
];
for (const [marker, message] of requiredServerControls) {
  if (!server.includes(marker)) throw new Error(message);
}
if (server.includes("import './server/routes'") || server.includes("import 'dotenv/config'")) {
  throw new Error('Legacy Express dependencies must not load before the opt-in guard');
}
if (server.includes('process.env.HOST')) {
  throw new Error('Express compatibility server must not accept a configurable public bind host');
}

const forbiddenClientMarkers = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EBAY_TOKEN_ENCRYPTION_KEY',
  'PLATFORM_SUPER_ADMIN_USER_IDS',
];
function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}
const forbiddenCredentialPatterns = [
  { pattern: /sb_secret_[A-Za-z0-9_-]{20,}/g, label: 'Supabase secret key value' },
  { pattern: /eyJ[A-Za-z0-9_-]{20,}[.][A-Za-z0-9_-]{20,}[.][A-Za-z0-9_-]{20,}/g, label: 'JWT credential value' },
];
for (const root of ['src', 'dist']) {
  for (const path of walk(root)) {
    const content = readFileSync(path, 'utf8');
    const marker = forbiddenClientMarkers.find(value => content.includes(value));
    if (marker) {
      throw new Error(`Private credential marker "${marker}" found in client artifact: ${relative('.', path)}`);
    }
    for (const { pattern, label } of forbiddenCredentialPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        throw new Error(`${label} found in client artifact: ${relative('.', path)}`);
      }
    }
  }
}
console.log('Security boundary checks passed: Express is local-only/opt-in and private credential markers are absent from browser source/build.');
