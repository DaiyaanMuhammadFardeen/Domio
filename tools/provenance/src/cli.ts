#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { emit } from './emit.js';

function help(): never {
  console.log(
    'Usage: provenance-emit --subject URI --digest ALG=HEX [--dep URI --digest ...] [--out PATH] [--signing-key-id ID --signing-key ENV]',
  );
  exit(0);
}

interface Slot {
  kind: 'subject' | 'dep';
  uri: string;
  digests: Record<string, string>;
}

interface CliSpec {
  slots: Slot[];
  out?: string;
  signingKeyId: string;
  signingKeyEnv: string;
  builderId: string;
  invocationId?: string;
}

function parse(args: string[]): CliSpec {
  const out: CliSpec = {
    slots: [],
    signingKeyId: 'local',
    signingKeyEnv: 'PROVENANCE_SIGNING_KEY',
    builderId: 'https://github.com/DaiyaanMuhammadFardeen/Domio/.github/workflows/build-provenance',
  };
  let current: Slot | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (a === '--subject') {
      current = { kind: 'subject', uri: '', digests: {} };
    } else if (a === '--dep') {
      current = { kind: 'dep', uri: '', digests: {} };
    } else if (a === '--out') {
      const v = args[++i];
      if (v !== undefined) out.out = v;
    } else if (a === '--signing-key-id') {
      const v = args[++i];
      if (v !== undefined) out.signingKeyId = v;
    } else if (a === '--signing-key') {
      const v = args[++i];
      if (v !== undefined) out.signingKeyEnv = v;
    } else if (a === '--builder-id') {
      const v = args[++i];
      if (v !== undefined) out.builderId = v;
    } else if (a === '--invocation-id') {
      const v = args[++i];
      if (v !== undefined) out.invocationId = v;
    } else if (a === '--digest') {
      if (!current) {
        console.error('--digest must follow --subject or --dep');
        exit(2);
      }
      const v = args[++i] ?? '';
      const idx = v.indexOf('=');
      if (idx <= 0) {
        console.error('--digest expects ALG=HEX');
        exit(2);
      }
      current.digests[v.slice(0, idx)] = v.slice(idx + 1);
    } else if (a === '--help' || a === '-h') {
      help();
    } else if (current && current.uri === '') {
      current.uri = a;
    } else {
      console.error('unexpected arg:', a);
      help();
    }
  }

  return out;
}

function main(): void {
  if (argv.includes('--help') || argv.includes('-h')) help();
  const spec = parse(argv);
  const key = process.env[spec.signingKeyEnv];
  if (!key) {
    console.error(`signing key ${spec.signingKeyEnv} is not set`);
    exit(1);
  }
  const subjects = spec.slots
    .filter((s) => s.kind === 'subject')
    .map((s) => ({ uri: s.uri, digest: s.digests }));
  const deps = spec.slots
    .filter((s) => s.kind === 'dep')
    .map((s) => ({ uri: s.uri, digest: s.digests }));
  const env = emit(subjects, deps, {
    signingKey: key,
    keyId: spec.signingKeyId,
    builderId: spec.builderId,
    ...(spec.invocationId ? { invocationId: spec.invocationId } : {}),
  });
  const json = JSON.stringify(env, null, 2);
  if (spec.out) writeFileSync(spec.out, json);
  else console.log(json);
}

if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts')) {
  try {
    main();
  } catch (err) {
    console.error((err as Error).message);
    exit(1);
  }
}
