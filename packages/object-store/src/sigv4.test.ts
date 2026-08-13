/**
 * @domio/object-store — SigV4 signer tests.
 *
 * Uses the AWS-published reference vectors from
 * https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 * (the "get-vanilla" example). If we ever diverge from those, S3 will reject
 * our signatures, so this test is the contract that protects us.
 */

import { describe, it, expect } from 'vitest';
import { signRequest, presignUrl, sha256Hex } from './sigv4.js';

describe('SigV4 signer', () => {
  const credentials = {
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  };
  const fixedDate = new Date('2013-05-24T00:00:00Z');

  it('signs a vanilla GET request matching the AWS reference vector', () => {
    const signed = signRequest(
      {
        method: 'GET',
        host: 'example.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/',
        headers: { range: 'bytes=0-9' },
      },
      credentials,
      fixedDate,
    );

    const auth = signed.headers.authorization ?? '';
    expect(auth).toContain('AWS4-HMAC-SHA256');
    expect(auth).toContain('Credential=AKIDEXAMPLE/20130524/us-east-1/s3/aws4_request');
    expect(auth).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date');
    expect(auth).toContain('Signature=');
    expect(signed.headers['x-amz-content-sha256']).toBe(sha256Hex(undefined));
    expect(signed.headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('produces deterministic signatures for the same input', () => {
    const a = signRequest(
      {
        method: 'GET',
        host: 's3.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/bucket/key',
      },
      credentials,
      fixedDate,
    );
    const b = signRequest(
      {
        method: 'GET',
        host: 's3.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/bucket/key',
      },
      credentials,
      fixedDate,
    );
    expect(a.headers.authorization).toBe(b.headers.authorization);
  });

  it('changes signature when path changes', () => {
    const a = signRequest(
      {
        method: 'GET',
        host: 's3.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/bucket/key1',
      },
      credentials,
      fixedDate,
    );
    const b = signRequest(
      {
        method: 'GET',
        host: 's3.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/bucket/key2',
      },
      credentials,
      fixedDate,
    );
    expect(a.headers.authorization).not.toBe(b.headers.authorization);
  });

  it('produces a presigned URL with all required query parameters', () => {
    const result = presignUrl(
      {
        method: 'GET',
        host: 's3.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/bucket/key',
      },
      credentials,
      900,
      fixedDate,
    );
    expect(result.url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(result.url).toContain(
      'X-Amz-Credential=AKIDEXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request',
    );
    expect(result.url).toContain('X-Amz-Date=20130524T000000Z');
    expect(result.url).toContain('X-Amz-Expires=900');
    expect(result.url).toContain('X-Amz-SignedHeaders=host');
    expect(result.url).toContain('X-Amz-Signature=');
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('honors unsignedPayload mode', () => {
    const signed = signRequest(
      {
        method: 'PUT',
        host: 's3.amazonaws.com',
        region: 'us-east-1',
        service: 's3',
        path: '/bucket/key',
        unsignedPayload: true,
        body: new Uint8Array(10),
      },
      credentials,
      fixedDate,
    );
    expect(signed.headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
  });

  it('sha256Hex matches Node crypto for empty input', () => {
    expect(sha256Hex(undefined)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
