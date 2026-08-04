/**
 * State-machine module barrel — Phase 10 M3 surface.
 */
export {
  EVENT_PRECEDENCE,
  PRECEDENCE_LADDER,
  TransitionEvaluator,
  type InteractionEvent,
  type InteractionEventKind,
} from './transition-evaluator.js';
export {
  EventBus,
  type StateTransitionEvent,
  type StateTransitionHandler,
} from './event-bus.js';
export {
  StateMachine,
  type StateDef,
  type StateMachineDef,
  type StateMachineTransitionHandler,
  type StateTransition,
  type StateTransitionResult,
} from './state-machine.js';
export {
  SCOPE_LADDER,
  StateScope,
  type StatePersistenceScope,
  type StateScopeRecord,
  type StateScopeSnapshot,
} from './state-scope.js';
