/**
 * Copilot panel entry — registers the right-rail AI Copilot hub
 * under the registry's `ai` group.
 *
 * Per Wave 6 §S6.1 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * The original Phase 12 OutlineApproval panel stays as a left-rail
 * leftTab (registered as `p12-copilot` in registry.ts). This new
 * entry registers `copilot-hub` as a right-surface panel under group
 * `ai` for the hub command center toggle (Cmd+J).
 */

import type { ReactElement } from 'react';
import type { PanelModule } from './context';
import { CopilotHub } from '../components/copilot/CopilotHub';

export const CopilotHubEntry: PanelModule = {
  Component: (): ReactElement => <CopilotHub defaultOpen />,
};
