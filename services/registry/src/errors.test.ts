import { describe, it, expect } from 'vitest';
import { Errors, RegistryError, toRegistryError } from './errors.js';

describe('errors', () => {
  describe('Errors factory', () => {
    it('notFound creates 404', () => {
      const e = Errors.notFound('widget');
      expect(e).toBeInstanceOf(RegistryError);
      expect(e.code).toBe('ERR_NOT_FOUND');
      expect(e.status).toBe(404);
      expect(e.message).toBe('widget not found');
    });
    it('alreadyExists creates 409', () => {
      const e = Errors.alreadyExists('thing');
      expect(e.code).toBe('ERR_ALREADY_EXISTS');
      expect(e.status).toBe(409);
    });
    it('conflict creates 409', () => {
      const e = Errors.conflict();
      expect(e.code).toBe('ERR_CONFLICT');
      expect(e.status).toBe(409);
    });
    it('gone creates 410', () => {
      const e = Errors.gone();
      expect(e.code).toBe('ERR_GONE');
      expect(e.status).toBe(410);
    });
    it('validation creates 400', () => {
      const e = Errors.validation('bad input', { field: 'x' });
      expect(e.code).toBe('ERR_VALIDATION');
      expect(e.status).toBe(400);
      expect(e.detail).toEqual({ field: 'x' });
    });
    it('tampered creates 409', () => {
      const e = Errors.tampered();
      expect(e.code).toBe('ERR_TAMPERED_PACKAGE');
      expect(e.status).toBe(409);
    });
    it('licenseMissing creates 403', () => {
      const e = Errors.licenseMissing();
      expect(e.code).toBe('ERR_LICENSE_MISSING');
      expect(e.status).toBe(403);
    });
    it('licenseExpired creates 403', () => {
      const e = Errors.licenseExpired();
      expect(e.code).toBe('ERR_LICENSE_EXPIRED');
      expect(e.status).toBe(403);
    });
    it('licenseRevoked creates 403', () => {
      const e = Errors.licenseRevoked();
      expect(e.code).toBe('ERR_LICENSE_REVOKED');
      expect(e.status).toBe(403);
    });
    it('seatLimit creates 403', () => {
      const e = Errors.seatLimit();
      expect(e.code).toBe('ERR_SEAT_LIMIT');
      expect(e.status).toBe(403);
    });
    it('brandLock creates 403', () => {
      const e = Errors.brandLock();
      expect(e.code).toBe('ERR_BRAND_LOCK');
      expect(e.status).toBe(403);
    });
    it('pinUnavailable creates 409', () => {
      const e = Errors.pinUnavailable();
      expect(e.code).toBe('ERR_PIN_UNAVAILABLE');
      expect(e.status).toBe(409);
    });
    it('policyMismatch creates 409', () => {
      const e = Errors.policyMismatch();
      expect(e.code).toBe('ERR_POLICY_MISMATCH');
      expect(e.status).toBe(409);
    });
    it('transition creates 409', () => {
      const e = Errors.transition();
      expect(e.code).toBe('ERR_TRANSITION_INVALID');
      expect(e.status).toBe(409);
    });
    it('deprecated creates 410', () => {
      const e = Errors.deprecated();
      expect(e.code).toBe('ERR_DEPRECATED');
      expect(e.status).toBe(410);
    });
    it('unauthorized creates 401', () => {
      const e = Errors.unauthorized();
      expect(e.code).toBe('ERR_UNAUTHORIZED');
      expect(e.status).toBe(401);
    });
    it('offlineExpired creates 403', () => {
      const e = Errors.offlineExpired();
      expect(e.code).toBe('ERR_OFFLINE_EXPIRED');
      expect(e.status).toBe(403);
    });
    it('moderationQueued creates 202', () => {
      const e = Errors.moderationQueued();
      expect(e.code).toBe('ERR_MODERATION_QUEUED');
      expect(e.status).toBe(202);
    });
  });

  describe('RegistryError', () => {
    it('has name "RegistryError"', () => {
      const e = new RegistryError('ERR_VALIDATION', 'test', 400);
      expect(e.name).toBe('RegistryError');
      expect(e).toBeInstanceOf(Error);
    });
  });

  describe('toRegistryError', () => {
    it('passes through RegistryError', () => {
      const original = Errors.notFound('x');
      expect(toRegistryError(original)).toBe(original);
    });
    it('wraps Error into RegistryError', () => {
      const wrapped = toRegistryError(new Error('boom'));
      expect(wrapped.code).toBe('ERR_VALIDATION');
      expect(wrapped.status).toBe(500);
      expect(wrapped.message).toBe('boom');
    });
    it('wraps non-Error', () => {
      const wrapped = toRegistryError('string error');
      expect(wrapped.code).toBe('ERR_VALIDATION');
      expect(wrapped.message).toBe('Unknown error');
    });
  });
});
