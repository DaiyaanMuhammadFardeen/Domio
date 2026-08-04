import type { McpTool } from './types.js';
import { hotspotTools } from './hotspots.js';
import { overlayTools } from './overlays.js';
import { stateMachineTools } from './state-machines.js';
import { variableTools } from './variables.js';
import { ruleTools } from './rules.js';
import { bindingTools } from './bindings.js';
import { formTools } from './forms.js';
import { calculatorTools } from './calculators.js';
import { deviceFrameTools } from './device-frames.js';
import { quizTools } from './quizzes.js';
import { sequenceTools } from './sequences.js';
import { deepLinkTools } from './deep-links.js';
import { nlPatchTools } from './nl-patch.js';
import { simulationTools } from './simulate.js';
import { deckDiffTools } from './diff.js';

export * from './types.js';

export const hotspotToolList = hotspotTools;
export const overlayToolList = overlayTools;
export const stateMachineToolList = stateMachineTools;
export const variableToolList = variableTools;
export const ruleToolList = ruleTools;
export const bindingToolList = bindingTools;
export const formToolList = formTools;
export const calculatorToolList = calculatorTools;
export const deviceFrameToolList = deviceFrameTools;
export const quizToolList = quizTools;
export const sequenceToolList = sequenceTools;
export const deepLinkToolList = deepLinkTools;
export const nlPatchToolList = nlPatchTools;
export const simulationToolList = simulationTools;
export const deckDiffToolList = deckDiffTools;

export const allPrototypingTools: ReadonlyArray<McpTool<unknown, unknown>> = [
  ...(hotspotTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(overlayTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(stateMachineTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(variableTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(ruleTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(bindingTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(formTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(calculatorTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(deviceFrameTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(quizTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(sequenceTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(deepLinkTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(nlPatchTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(simulationTools as ReadonlyArray<McpTool<unknown, unknown>>),
  ...(deckDiffTools as ReadonlyArray<McpTool<unknown, unknown>>),
];

export * from './hotspots.js';
export * from './overlays.js';
export * from './state-machines.js';
export * from './variables.js';
export * from './rules.js';
export * from './bindings.js';
export * from './forms.js';
export * from './calculators.js';
export * from './device-frames.js';
export * from './quizzes.js';
export * from './sequences.js';
export * from './deep-links.js';
export * from './nl-patch.js';
export * from './simulate.js';
export * from './diff.js';
