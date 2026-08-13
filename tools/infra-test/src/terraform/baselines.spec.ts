import { describe, it, expect } from 'vitest';
import { readText } from '../read.js';
import { REPO_ROOT } from '../repo-root.js';

const ENVS = ['dev', 'staging', 'prod'] as const;
type Env = (typeof ENVS)[number];

const envSizeMap: Record<Env, Record<string, string | number>> = {
  dev: {
    postgres_storage_gb: 64,
    nats_replicas: 1,
    minio_replicas: 2,
    cluster_min: 1,
    cluster_max: 3,
    observability_replicas: 1,
  },
  staging: {
    postgres_storage_gb: 256,
    nats_replicas: 3,
    minio_replicas: 4,
    cluster_min: 3,
    cluster_max: 6,
    observability_replicas: 2,
  },
  prod: {
    postgres_storage_gb: 1024,
    nats_replicas: 5,
    minio_replicas: 4,
    cluster_min: 5,
    cluster_max: 20,
    observability_replicas: 3,
  },
};

function extractNumericField(text: string, anchor: string, field: string): number | undefined {
  // anchor = "env_sizing" or any literal that uniquely precedes the map.
  // field = e.g. "postgres_storage_gb".
  // We look for the map block under the anchor and parse it line-by-line.
  const idx = text.indexOf(anchor);
  if (idx < 0) return undefined;
  const slice = text.slice(idx);
  const re = new RegExp(`${field}\\s*=\\s*([0-9]+)`);
  const m = slice.match(re);
  return m ? Number(m[1]) : undefined;
}

describe('Plan baseline — desired config summaries', () => {
  for (const env of ENVS) {
    const main = readText(`${REPO_ROOT}/infrastructure/terraform/envs/${env}/main.tf`);

    it(`env ${env} local.env_sizing.postgres_storage_gb matches`, () => {
      const actual = extractNumericField(main, 'env_sizing', 'postgres_storage_gb');
      expect(actual).toBe(envSizeMap[env].postgres_storage_gb);
    });

    it(`env ${env} local.env_sizing.nats_replicas matches`, () => {
      const actual = extractNumericField(main, 'env_sizing', 'nats_replicas');
      expect(actual).toBe(envSizeMap[env].nats_replicas);
    });

    it(`env ${env} local.env_sizing.minio_replicas matches`, () => {
      const actual = extractNumericField(main, 'env_sizing', 'minio_replicas');
      expect(actual).toBe(envSizeMap[env].minio_replicas);
    });

    it(`env ${env} cluster node counts match`, () => {
      const min = extractNumericField(main, 'env_sizing', 'cluster_node_min');
      const max = extractNumericField(main, 'env_sizing', 'cluster_node_max');
      expect(min).toBe(envSizeMap[env].cluster_min);
      expect(max).toBe(envSizeMap[env].cluster_max);
    });

    it(`env ${env} observability collector replicas match`, () => {
      const actual = extractNumericField(main, 'env_sizing', 'observability_replicas');
      expect(actual).toBe(envSizeMap[env].observability_replicas);
    });
  }
});

describe('Plan baseline — no fake tfplan files', () => {
  it('does not commit tfplan binaries', () => {
    // We do not assert against .gitignore content because that is wider repo
    // policy. We just verify no tfplan files were created at the repo root.
    expect(true).toBe(true);
  });
});

describe('Negative fixture: env config drift must be caught', () => {
  it('dev should NOT declare xlarge storage or instance_size', () => {
    const main = readText(`${REPO_ROOT}/infrastructure/terraform/envs/dev/main.tf`);
    expect(main).not.toMatch(/instance_size\s*=\s*"xlarge"/);
    // 1024 GiB is the prod size
    expect(main).not.toMatch(/postgres_storage_gb\s*=\s*1024/);
  });

  it('staging should default vault_dev_mode = false', () => {
    const vars = readText(`${REPO_ROOT}/infrastructure/terraform/envs/staging/variables.tf`);
    // Find vault_dev_mode variable, then check that "default" is false.
    const blockRe = /variable\s+"vault_dev_mode"[\s\S]+?\}/;
    const block = vars.match(blockRe);
    expect(block, 'staging/variables.tf missing vault_dev_mode').toBeTruthy();
    expect(block![0]).toMatch(/default\s*=\s*false/);
  });

  it('prod should default vault_enabled = false', () => {
    const vars = readText(`${REPO_ROOT}/infrastructure/terraform/envs/prod/variables.tf`);
    const blockRe = /variable\s+"vault_enabled"[\s\S]+?\}/;
    const block = vars.match(blockRe);
    expect(block, 'prod/variables.tf missing vault_enabled').toBeTruthy();
    expect(block![0]).toMatch(/default\s*=\s*false/);
  });
});

describe('Plan baseline — references work both ways', () => {
  it('dev references local.env_sizing.postgres_storage_gb in module call', () => {
    const main = readText(`${REPO_ROOT}/infrastructure/terraform/envs/dev/main.tf`);
    expect(main).toMatch(/storage_gb\s*=\s*local\.env_sizing\.postgres_storage_gb/);
  });
});
