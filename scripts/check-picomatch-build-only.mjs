import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const packages = lock.packages;
const root = packages[''];
function reachable(rootNames) {
  const seen = new Set();
  const queue = [...rootNames].map((name) => `node_modules/${name}`);
  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const entry = packages[path];
    if (!entry) continue;
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) queue.push(`node_modules/${name}`);
  }
  return seen;
}
const production = reachable(Object.keys(root.dependencies ?? {}));
const development = reachable(Object.keys(root.devDependencies ?? {}));
const picomatch = 'node_modules/picomatch';
if (production.has(picomatch)) throw new Error('Security boundary failed: picomatch is reachable from production dependencies.');
if (!development.has(picomatch)) throw new Error('Expected picomatch to remain confined to development tooling.');
for (const name of ['vite', '@vitejs/plugin-react', '@tailwindcss/vite']) {
  if (!root.devDependencies?.[name] || root.dependencies?.[name]) throw new Error(`${name} must remain development-only.`);
}
console.log('PASS: picomatch is confined to the Vite build dependency graph and is not production-reachable.');
