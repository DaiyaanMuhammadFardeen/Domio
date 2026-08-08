/**
 * Event-ingest — schema validation (Phase 17 W1).
 *
 * Validates each event against the JSON Schemas under
 * contracts/events/ingest/*.json. ajv is used for speed and because the
 * repo already pins ajv@8.17.1 + ajv-formats@3.0.1 as root devDeps.
 *
 * The compiled validators are loaded lazily on first validate() call so
 * unit tests can construct an EventValidator without filesystem access.
 */

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaError } from './errors.js';
import type { AnalyticsEvent, EventName } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../contracts/events/ingest');

interface Compiled {
  view: ValidateFunction;
  interaction: ValidateFunction;
  scroll_progress: ValidateFunction;
  scroll_pause: ValidateFunction;
  presenter_event: ValidateFunction;
  live_session_event: ValidateFunction;
}

function loadSchemas(): Compiled {
  const ajv = new Ajv({ allErrors: true, removeAdditional: false, strict: false });
  addFormats(ajv);

  function load(name: string): ValidateFunction {
    const path = resolve(SCHEMA_DIR, `${name}.json`);
    const raw = readFileSync(path, 'utf-8');
    const schema = JSON.parse(raw);
    return ajv.compile(schema);
  }

  return {
    view: load('view'),
    interaction: load('interaction'),
    scroll_progress: load('scroll_progress'),
    scroll_pause: load('scroll_pause'),
    presenter_event: load('presenter_event'),
    live_session_event: load('live_session_event'),
  };
}

export interface EventValidator {
  validate(event: unknown): asserts event is AnalyticsEvent;
  /** Returns the error message if invalid; null if valid. */
  tryValidate(event: unknown): string | null;
}

export function buildValidator(): EventValidator {
  let schemas: Compiled | null = null;
  const ensure = (): Compiled => {
    if (!schemas) schemas = loadSchemas();
    return schemas;
  };

  const validatorFor = (name: EventName): ValidateFunction => {
    const s = ensure();
    switch (name) {
      case 'view':
        return s.view;
      case 'interaction':
        return s.interaction;
      case 'scroll_progress':
        return s.scroll_progress;
      case 'scroll_pause':
        return s.scroll_pause;
      case 'presenter_event':
        return s.presenter_event;
      case 'live_session_event':
        return s.live_session_event;
      default: {
        const exhaustive: never = name;
        throw new SchemaError(`unknown event_name: ${String(exhaustive)}`);
      }
    }
  };

  return {
    validate(event) {
      const err = this.tryValidate(event);
      if (err !== null) throw new SchemaError(err);
    },
    tryValidate(event) {
      if (typeof event !== 'object' || event === null) {
        return 'event must be a non-null object';
      }
      const rec = event as Record<string, unknown>;
      const name = rec['event_name'];
      if (typeof name !== 'string') {
        return 'event_name must be a string';
      }
      const fn = validatorFor(name as EventName);
      if (!fn(rec)) {
        const errors = (fn.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`).join('; ');
        return `schema mismatch: ${errors}`;
      }
      return null;
    },
  };
}

/**
 * In-test validator that doesn't touch the filesystem. Useful for unit
 * tests that want a known-good validator without the schema files
 * present.
 */
export function buildPassthroughValidator(): EventValidator {
  return {
    validate(event) {
      if (typeof event !== 'object' || event === null) {
        throw new SchemaError('event must be a non-null object');
      }
    },
    tryValidate(event) {
      if (typeof event !== 'object' || event === null) {
        return 'event must be a non-null object';
      }
      return null;
    },
  };
}
