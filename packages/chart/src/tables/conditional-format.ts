/**
 * Conditional formatting rules for table cells.
 *
 * First matching rule wins.
 */

export interface ConditionalFormatRule {
  column: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between' | 'contains';
  threshold?: number;
  threshold2?: number;
  value?: string;
  style: { backgroundColor?: string; color?: string; fontWeight?: number };
}

/**
 * Evaluate a single rule against a cell value.
 */
function matchesRule(value: unknown, rule: ConditionalFormatRule): boolean {
  const num = typeof value === 'number' ? value : Number(value);
  const hasNum = Number.isFinite(num);

  switch (rule.operator) {
    case 'lt':
      return hasNum && num < (rule.threshold ?? 0);
    case 'lte':
      return hasNum && num <= (rule.threshold ?? 0);
    case 'gt':
      return hasNum && num > (rule.threshold ?? 0);
    case 'gte':
      return hasNum && num >= (rule.threshold ?? 0);
    case 'eq':
      return value === rule.threshold || (hasNum && num === rule.threshold);
    case 'between':
      return hasNum && num >= (rule.threshold ?? 0) && num <= (rule.threshold2 ?? 0);
    case 'contains':
      return String(value).includes(rule.value ?? '');
    default:
      return false;
  }
}

/**
 * Apply conditional formatting rules to a cell value.
 * Returns the style of the first matching rule, or undefined.
 */
export function applyConditionalFormat(
  value: unknown,
  column: string,
  rules: ConditionalFormatRule[],
): { backgroundColor?: string; color?: string; fontWeight?: number } | undefined {
  for (const rule of rules) {
    if (rule.column === column && matchesRule(value, rule)) {
      return rule.style;
    }
  }
  return undefined;
}
