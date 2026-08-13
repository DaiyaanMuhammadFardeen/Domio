/**
 * Canvas chrome barrel — exports the editor's S2.1 surface.
 *
 * Wave 2 §S2.1. The canvas package provides the underlying math
 * (grid, guides, snap); this barrel surfaces the editor's
 * presentational chrome on top.
 */

export { Rulers, tickStepForZoom } from './Rulers';
export type { RulersProps } from './Rulers';
export { Guides } from './Guides';
export type { GuidesProps } from './Guides';
export { GridOverlay } from './GridOverlay';
export type { GridOverlayProps } from './GridOverlay';
export { ZoomHUD } from './ZoomHUD';
export type { ZoomHUDProps } from './ZoomHUD';
export { SnapEngine } from './SnapEngine';
export type { SnapCandidate, SnapEngineInputs, SnapHint } from './SnapEngine';
export { GroupTransformHandle } from './GroupTransformHandle';
export type {
  GroupTransformHandleProps,
  GroupTransformAabb,
  ResizeEdge,
} from './GroupTransformHandle';
export { OutlineTree } from './OutlineTree';
export type { OutlineTreeProps } from './OutlineTree';
export { PanelRail } from './PanelRail';
export type { PanelRailProps, PanelRailGroup, PanelRailPanel } from './PanelRail';
export { PanelFooter } from './PanelFooter';