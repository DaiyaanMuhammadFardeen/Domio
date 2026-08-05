export {
  parseLottieJson,
  type LottieParsed,
  type LottieLayer,
} from './parser.js';

export {
  applyVariables,
  findVariableRefs,
  type VariableOverride,
} from './variables.js';

export {
  listInputs,
  getInput,
  getTrigger,
  fireTrigger,
  type RiveInput,
  type RiveInputType,
  type RiveStateMachineDescriptor,
  type TriggerResult,
  type TriggerError,
} from './state-machine.js';

export {
  interpolateAt,
  sampleChannel,
  type Keyframe,
} from './scrub.js';
