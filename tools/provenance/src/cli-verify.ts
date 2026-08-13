#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { verify } from './verify.js';

function main(): void {
  const envName = argv[2];
  if (!envName || envName.startsWith('--')) {
    console.error(
      'Usage: provenance-verify <path-to-envelope.json> --signing-key ENV [--signing-key-id ID]',
    );
    exit(1);
  }
  const keyEnvIdx = argv.indexOf('--signing-key');
  const keyIdIdx = argv.indexOf('--signing-key-id');
  const keyEnv =
    keyEnvIdx >= 0 ? (argv[keyEnvIdx + 1] ?? 'PROVENANCE_SIGNING_KEY') : 'PROVENANCE_SIGNING_KEY';
  const keyId = keyIdIdx >= 0 ? (argv[keyIdIdx + 1] ?? 'local') : 'local';
  const key = process.env[keyEnv];
  if (!key) {
    console.error(`signing key ${keyEnv} is not set`);
    exit(1);
  }
  const envelope = JSON.parse(readFileSync(envName, 'utf8'));
  const result = verify(envelope, { keys: { [keyId]: key } });
  if (!result.ok) {
    console.error('verify failed:', result.reason);
    exit(1);
  }
  console.log('OK');
}

if (process.argv[1]?.endsWith('cli-verify.js') || process.argv[1]?.endsWith('cli-verify.ts')) {
  try {
    main();
  } catch (err) {
    console.error((err as Error).message);
    exit(1);
  }
}
