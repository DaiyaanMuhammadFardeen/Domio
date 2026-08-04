/**
 * Toggle series visibility — flip visibility state of an element.
 */

import type { SvgElement } from '../types.js';

/**
 * Toggle visibility of elements matching a semantic ID prefix.
 * Returns new array with toggled visibility.
 */
export function toggleSeries(
  elements: SvgElement[],
  seriesId: string,
): SvgElement[] {
  return elements.map((el) => {
    if (el.semanticId === seriesId || el.semanticId.startsWith(`${seriesId}_`)) {
      return {
        ...el,
        visible: el.visible === false ? true : false,
      };
    }
    return el;
  });
}

/**
 * Toggle visibility of a single element by semantic ID.
 */
export function toggleElement(
  elements: SvgElement[],
  semanticId: string,
): SvgElement[] {
  return elements.map((el) => {
    if (el.semanticId === semanticId) {
      return {
        ...el,
        visible: el.visible === false ? true : false,
      };
    }
    return el;
  });
}

/**
 * Set visibility of all elements.
 */
export function setAllVisible(
  elements: SvgElement[],
  visible: boolean,
): SvgElement[] {
  return elements.map((el) => ({ ...el, visible }));
}
