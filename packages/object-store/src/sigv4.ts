/**
 * @domio/object-store — AWS SigV4 signer.
 *
 * We sign S3 REST requests directly with HTTP fetch instead of pulling in the
 * ~3 MB @aws-sdk/client-s3 dependency. The signing algorithm is fully
 * specified (RFC: AWS Signature Version 4). Implementation follows
 * https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 *
 * This file is intentionally framework-free (no fetch abstraction). Callers
 * pass in their preferred fetch impl via the signer's `fetch` field, or rely
 * on the global `fetch` available in Node 18+.
 */

import { createHmac, createHash } from 'node:crypto';

export interface SigV4Credentials {
  readonly accessKey: string;
  readonly secretKey: string;
}

export interface SigV4Request {
  readonly method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD';
  readonly host: string;
  readonly region: string;
  readonly service: 's3';
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Uint8Array | undefined;
  readonly unsignedPayload?: boolean;
}

export interface SignedRequest extends SigV4Request {
  readonly headers: Record<string, string>;
}

const ALG = 'AWS4-HMAC-SHA256';

export function sha256Hex(body: Uint8Array | undefined): string {
  return createHash('sha256').update(body ?? new Uint8Array(0)).digest('hex');
}

export function hmac(key: Uint8Array | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function hex(buf: Buffer): string {
  return buf.toString('hex');
}

export function deriveSigningKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export function signRequest(req: SigV4Request, credentials: SigV4Credentials, now?: Date): SignedRequest {
  const t = now ?? new Date();
  const amzDate = t.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = req.unsignedPayload ? 'UNSIGNED-PAYLOAD' : sha256Hex(req.body);

  const headers: Record<string, string> = {
    ...(req.headers ?? {}),
    host: req.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => {
    const orig = Object.keys(headers).find((h) => h.toLowerCase() === k);
    return `${k}:${headers[orig!]?.trim() ?? ''}\n`;
  }).join('');

  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalQuery = Object.entries(req.query ?? {})
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    req.method,
    req.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${req.region}/${req.service}/aws4_request`;
  const stringToSign = [ALG, amzDate, credentialScope, sha256Hex(new TextEncoder().encode(canonicalRequest))].join('\n');

  const signingKey = deriveSigningKey(credentials.secretKey, dateStamp, req.region, req.service);
  const signature = hex(hmac(signingKey, stringToSign));

  headers.authorization = `${ALG} Credential=${credentials.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...req, headers };
}

/**
 * Canonical presigned-URL signing for S3. The query string is sorted, the
 * signed-headers list is fixed at "host", and the signature covers the full
 * URL including the X-Amz-* query parameters.
 */
export function presignUrl(req: SigV4Request, credentials: SigV4Credentials, expiresInSeconds: number, now?: Date): { url: string; signature: string } {
  const t = now ?? new Date();
  const amzDate = t.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const query: Record<string, string> = {
    ...(req.query ?? {}),
    'X-Amz-Algorithm': ALG,
    'X-Amz-Credential': `${credentials.accessKey}/${dateStamp}/${req.region}/s3/aws4_request`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  const sortedKeys = Object.keys(query).sort();
  const canonicalQuery = sortedKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k] ?? '')}`).join('&');
  const canonicalRequest = [req.method, req.path, canonicalQuery, `host:${req.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');

  const credentialScope = `${dateStamp}/${req.region}/s3/aws4_request`;
  const stringToSign = [ALG, amzDate, credentialScope, sha256Hex(new TextEncoder().encode(canonicalRequest))].join('\n');

  const signingKey = deriveSigningKey(credentials.secretKey, dateStamp, req.region, 's3');
  const signature = hex(hmac(signingKey, stringToSign));

  const scheme = req.host.includes('localhost') || req.host.startsWith('127.') ? 'http' : 'https';
  return {
    url: `${scheme}://${req.host}${req.path}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    signature,
  };
}