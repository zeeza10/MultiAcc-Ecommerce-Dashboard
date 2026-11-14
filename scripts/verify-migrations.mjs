import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve('supabase/migrations');
const files = readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
const seen = new Map();
const invalid = [];

for (const file of files) {
  const match = file.match(/^(\d{14})_.+\.sql$/);
  if (!match) {
    invalid.push(file);
    continue;
  }
  const version = match[1];
  const previous = seen.get(version);
  if (previous) {
    throw new Error(`Duplicate migration version ${version}: ${previous} and ${file}`);
  }
  seen.set(version, file);
}

if (invalid.length) {
  throw new Error(`Invalid migration filenames: ${invalid.join(', ')}`);
}

console.log(`Verified ${files.length} migration files with unique 14-digit versions.`);
