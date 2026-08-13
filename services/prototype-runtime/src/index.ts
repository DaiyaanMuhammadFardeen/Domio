/**
 * @domio/prototype-runtime-service — Phase 10 M1+M2 data plane.
 *
 * REST backend for hotspot, overlay, branching-edge, interaction-state,
 * variable, variable-binding, and conditional-rule CRUD.
 *
 * Public surface:
 *   - In-memory repositories (testing + dev fallback)
 *   - PrototypeRuntimeService — business logic, optimistic locking,
 *     expression compilation for conditional rules
 *   - Web-framework-free HTTP handlers
 *   - Metrics + audit recorder helpers
 */

export * from './dal.js';
export * from './schemas.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
