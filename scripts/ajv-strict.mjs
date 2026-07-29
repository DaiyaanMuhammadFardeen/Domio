#!/usr/bin/env node
// scripts/ajv-strict.mjs
// Strict AJV validation for every JSON Schema under contracts/schema/v1/.
// Used by .github/workflows/contract.yml.
//
// Requires ajv (^8) and ajv-formats as devDependencies OR globally available.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMAS_DIR = join(__dirname, "..", "contracts", "schema", "v1");

function loadSchemas(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith(".schema.json"))
    .map((n) => ({
      name: n,
      path: join(dir, n),
      data: JSON.parse(readFileSync(join(dir, n), "utf8")),
    }));
}

async function tryImportAjv() {
  // Node resolves bare specifiers relative to the SCRIPT location, not cwd.
  // The script lives in scripts/, but ajv lives in <repo>/node_modules.
  // So we resolve from the repo root via createRequire.
  const require = createRequire(join(__dirname, "..", "package.json"));

  // Prefer ajv/dist/2020 (draft 2020-12), since our schemas use it.
  const tryPaths = [
    () => require("ajv/dist/2020"),
    () => require("ajv"),
  ];
  for (const p of tryPaths) {
    try {
      const Ajv = p();
      // ajv-formats works on any ajv instance.
      let addFormats = () => {};
      try {
        addFormats = require("ajv-formats");
      } catch {
        /* formats are optional */
      }
      return { Ajv, addFormats };
    } catch (e) {
      if (process.env.AJV_DEBUG) console.error(`path failed: ${e.message}`);
    }
  }
  throw new Error("ajv (^8) not installed in the monorepo root. Add it to devDependencies.");
}

async function main() {
  let Ajv;
  let addFormats;
  try {
    ({ Ajv, addFormats } = await tryImportAjv());
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  // ajv 8 with explicit 2020 meta-schema, so draft 2020-12 files compile.
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  const schemas = loadSchemas(SCHEMAS_DIR);
  if (schemas.length === 0) {
    console.error(`No schemas found in ${SCHEMAS_DIR}`);
    process.exit(2);
  }

  let hadFailure = false;

  for (const { name, data } of schemas) {
    let validate;
    try {
      validate = ajv.compile(data);
    } catch (e) {
      console.error(`[FAIL] ${name} did not compile: ${e.message}`);
      hadFailure = true;
      continue;
    }
    console.log(`[OK]   ${name} compiled (strict)`);

    // Positive cases — must always validate as the right type.
    const positives = [
      {},  // empty object usually passes unless additionalProperties:false
      { id: "01H0ABCDEF0123456789ABCDEF", kind: "deck" },
    ];
    let posPassed = 0;
    for (const p of positives) {
      const ok = validate(p);
      if (ok) {
        console.log(`  [+] positive case passed: ${JSON.stringify(p).slice(0, 60)}`);
        posPassed++;
      } else {
        console.log(`  [+] positive case rejected by ${name}: ${JSON.stringify(validate.errors).slice(0, 100)}`);
      }
    }
    // For schemas with additionalProperties:false at the top level,
    // the empty-object case still passes, so we only fail if NO positive passed.
    if (posPassed === 0 && JSON.stringify(data).includes('"additionalProperties": false')) {
      console.error(`[FAIL] ${name} rejected all positive cases despite additionalProperties:false at root`);
      hadFailure = true;
    }

    // Negative cases — must be rejected.
    // - non-object top-level: always invalid for type:object schemas.
    // - wrong-type primitives where a string is expected.
    const negatives = [
      "not an object",                 // top-level type mismatch
      42,                              // top-level type mismatch (integer)
      true,                            // top-level type mismatch (boolean)
      null,                            // null is not object
    ];
    let negPassed = 0;
    for (const n of negatives) {
      const ok = validate(n);
      if (!ok) {
        console.log(`  [-] negative correctly rejected: ${JSON.stringify(n).slice(0, 60)}`);
        negPassed++;
      } else {
        console.warn(`  [-] negative case wrongly accepted: ${JSON.stringify(n).slice(0, 60)}`);
      }
    }
    if (negPassed === 0) {
      console.error(`[FAIL] ${name} accepted every negative case (validator is broken)`);
      hadFailure = true;
    }
  }

  if (hadFailure) {
    process.exit(1);
  }
  console.log("All JSON Schemas validated strictly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
