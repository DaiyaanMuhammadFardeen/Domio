/**
 * crypto-stub.cjs — client-side stand-in for `node:crypto`.
 *
 * `@domio/deep-link/state-encoder` is server-only (it does HMAC-SHA256),
 * but it is transitively imported from client components such as
 * `ShareStateButton.tsx`. We swap the `node:crypto` (and bare `crypto`)
 * module for this stub during the client webpack build so the bundle
 * compiles. Runtime calls into the deep-link encoder from the browser
 * will throw with a clear "server-only" error pointing at the
 * migration path: share-link tokens must be minted by a server
 * endpoint, not in-browser crypto. See TODO in
 * `packages/deep-link/src/state-encoder.ts`.
 */

const ERR = new Error(
  'node:crypto is not available in the browser. ' +
    '@domio/deep-link/state-encoder is server-only; ' +
    'mint deep-link tokens via a server endpoint.',
);

function throwErr() {
  throw ERR;
}

module.exports = {
  createHmac: throwErr,
  timingSafeEqual: throwErr,
  randomBytes: throwErr,
  default: throwErr,
};
