import { describe, it, expect } from 'vitest';
import {
  buildResource,
  parseOtlpEndpoint,
  EndpointError,
  ResourceError,
  type ResourceAttributes,
} from '../src/resource.js';

describe('buildResource — positive coverage', () => {
  it('emits the four required Phase 01 resource attributes', () => {
    const r = buildResource({
      serviceName: 'apps-web',
      serviceVersion: '0.1.0',
      environment: 'development',
      gitSha: '7cbc65a',
    });
    expect(r['service.name']).toBe('apps-web');
    expect(r['service.version']).toBe('0.1.0');
    expect(r['deployment.environment']).toBe('development');
    expect(r['git.sha']).toBe('7cbc65a');
  });

  it('accepts full-length sha (40 chars) and short sha (7 chars)', () => {
    expect(buildResource({ serviceName: 's', gitSha: '0123457' })['git.sha']).toBe('0123457');
    expect(
      buildResource({ serviceName: 's', gitSha: '0123456789abcdef0123456789abcdef01234567' })[
        'git.sha'
      ],
    ).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('accepts hex sha in uppercase', () => {
    const r = buildResource({ serviceName: 's', gitSha: 'ABCDEF1' });
    expect(r['git.sha']).toBe('ABCDEF1');
  });

  it('defaults git.sha to "unknown" when not provided and env unset', () => {
    const prev = process.env['GIT_SHA'];
    delete process.env['GIT_SHA'];
    delete process.env['GITHUB_SHA'];
    try {
      const r = buildResource({ serviceName: 's' });
      expect(r['git.sha']).toBe('unknown');
    } finally {
      if (prev !== undefined) process.env['GIT_SHA'] = prev;
    }
  });

  it('reads gitSha from GIT_SHA env var when not provided', () => {
    const prev = process.env['GIT_SHA'];
    process.env['GIT_SHA'] = '123abc7';
    try {
      const r = buildResource({ serviceName: 's' });
      expect(r['git.sha']).toBe('123abc7');
    } finally {
      if (prev === undefined) delete process.env['GIT_SHA'];
      else process.env['GIT_SHA'] = prev;
    }
  });

  it('reads environment from DOMIO_ENV', () => {
    const prev = process.env['DOMIO_ENV'];
    process.env['DOMIO_ENV'] = 'staging';
    try {
      const r = buildResource({ serviceName: 's' });
      expect(r['deployment.environment']).toBe('staging');
    } finally {
      if (prev === undefined) delete process.env['DOMIO_ENV'];
      else process.env['DOMIO_ENV'] = prev;
    }
  });

  it('attaches optional namespace and host.name', () => {
    const r = buildResource({
      serviceName: 's',
      serviceNamespace: 'domio',
      hostName: 'pod-123',
    });
    expect(r['service.namespace']).toBe('domio');
    expect(r['host.name']).toBe('pod-123');
  });

  it('merges extra attributes and validates their keys', () => {
    const r = buildResource({
      serviceName: 's',
      extra: { 'domio.region': 'us_east_1' },
    });
    expect(r['domio.region']).toBe('us_east_1');
  });
});

describe('buildResource — negative coverage', () => {
  it('rejects service names with illegal characters', () => {
    expect(() => buildResource({ serviceName: 'has space' })).toThrow(ResourceError);
    expect(() => buildResource({ serviceName: 'has#hash' })).toThrow(ResourceError);
    expect(() => buildResource({ serviceName: '' })).toThrow(ResourceError);
  });

  it('rejects git shas that are too short or non-hex', () => {
    expect(() => buildResource({ serviceName: 's', gitSha: 'abc' })).toThrow(ResourceError);
    expect(() => buildResource({ serviceName: 's', gitSha: 'g'.repeat(40) })).toThrow(
      ResourceError,
    );
  });

  it('rejects extra attribute keys with illegal characters', () => {
    expect(() => buildResource({ serviceName: 's', extra: { 'illegal key': 'v' } })).toThrow(
      ResourceError,
    );
    expect(() => buildResource({ serviceName: 's', extra: { '1starts_with_digit': 'v' } })).toThrow(
      ResourceError,
    );
    const longKey = 'k'.repeat(300);
    expect(() => buildResource({ serviceName: 's', extra: { [longKey]: 'v' } })).toThrow(
      ResourceError,
    );
  });

  it('rejects extra attribute values with unsafe characters', () => {
    expect(() => buildResource({ serviceName: 's', extra: { region: 'us east 1' } })).toThrow(
      ResourceError,
    );
  });
});

describe('parseOtlpEndpoint — positive coverage', () => {
  it.each([
    ['http://localhost:4318', 'http:', 'localhost', '4318'],
    ['https://collector.example.com:4318', 'https:', 'collector.example.com', '4318'],
    ['http://127.0.0.1:4318/v1/traces', 'http:', '127.0.0.1', '4318'],
  ])('parses %s', (raw, proto, host) => {
    const u = parseOtlpEndpoint(raw);
    expect(u.protocol).toBe(proto);
    expect(u.hostname).toBe(host);
  });
});

describe('parseOtlpEndpoint — negative coverage', () => {
  it('throws on empty input', () => {
    expect(() => parseOtlpEndpoint('')).toThrow(EndpointError);
  });

  it('throws on malformed URL', () => {
    expect(() => parseOtlpEndpoint('not-a-url')).toThrow(EndpointError);
    expect(() => parseOtlpEndpoint('://broken')).toThrow(EndpointError);
  });

  it('throws on non-http(s) protocols', () => {
    expect(() => parseOtlpEndpoint('ftp://collector')).toThrow(EndpointError);
    expect(() => parseOtlpEndpoint('file:///etc/passwd')).toThrow(EndpointError);
    expect(() => parseOtlpEndpoint('gopher://x')).toThrow(EndpointError);
  });

  it('throws on URL without host', () => {
    expect(() => parseOtlpEndpoint('http://')).toThrow(EndpointError);
  });
});

describe('exported types — resource attributes shape', () => {
  it('attributes object satisfies the documented schema', () => {
    const r: ResourceAttributes = buildResource({ serviceName: 'demo' });
    expect(typeof r['service.name']).toBe('string');
    expect(typeof r['service.version']).toBe('string');
    expect(typeof r['deployment.environment']).toBe('string');
    expect(typeof r['git.sha']).toBe('string');
  });
});
