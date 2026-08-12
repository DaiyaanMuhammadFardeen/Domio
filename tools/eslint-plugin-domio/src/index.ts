/**
 * @domio/eslint-plugin — Domio's custom ESLint rules.
 *
 * Per Wave 1 §S1.10 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Enforces three cross-app conventions that the rest of the codebase
 * (build, test, typecheck) cannot catch:
 *
 *   domio/no-raw-href:
 *     Reject string-literal `href` values in JSX. Every cross-app
 *     link must use one of the typed builders in
 *     `@domio/ui/routing` (e.g. `editor()`, `viewer()`, `dashboard()`)
 *     so the apps stay portable across basePath/rewrite changes.
 *
 *   domio/no-raw-fetch:
 *     Reject direct `fetch(...)` calls inside component files. All
 *     network calls go through the typed SDK clients so they can be
 *     mocked, traced, and feature-flagged centrally.
 *
 *   domio/no-raw-hex:
 *     Reject raw hex color literals in JSX `style` / className
 *     strings. Use the design tokens from `@domio/ui/tokens.css`
 *     (CSS variables) so light/dark themes stay in sync.
 */

import type { Rule } from 'eslint';

const noRawHref: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow string-literal href values in JSX. Use the typed routing builders from @domio/ui instead.',
    },
    schema: [],
    messages: {
      noRawHref:
        'Use a typed routing builder (e.g. editor(), viewer(), dashboard() from @domio/ui) instead of a raw href string.',
    },
  },
  create(context) {
    return {
      // Match `<Link href="...">` and `<a href="...">` JSX opening
      // elements where `href` is a string literal.
      'JSXAttribute[name.name="href"]'(node: Rule.Node) {
        const attr = node as unknown as {
          value?: { type: string; value?: unknown };
        };
        const value = attr.value;
        if (
          value &&
          value.type === 'Literal' &&
          typeof value.value === 'string'
        ) {
          context.report({
            node,
            messageId: 'noRawHref',
          });
        }
      },
    };
  },
};

const noRawFetch: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct fetch() calls in component files. Use the typed SDK clients instead.',
    },
    schema: [],
    messages: {
      noRawFetch:
        'Move fetch() into a typed SDK client (e.g. packages/sdk-ts). Components should consume the service interface.',
    },
  },
  create(context) {
    return {
      // Match `fetch("...")` and `fetch(\`...\`)` in component files.
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'fetch'
        ) {
          context.report({ node, messageId: 'noRawFetch' });
        }
      },
    };
  },
};

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/;

const noRawHex: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow raw hex color literals in JSX. Use design tokens from @domio/ui/tokens.css instead.',
    },
    schema: [],
    messages: {
      noRawHex:
        'Use a design token (e.g. var(--surface-base)) instead of a raw hex literal.',
    },
  },
  create(context) {
    return {
      // Match hex literals inside JSX attribute string literals:
      //   <div style="color: #fff" />  — caught here.
      'JSXAttribute > Literal'(node: Rule.Node) {
        const literal = node as Rule.Node & { value?: unknown };
        if (typeof literal.value === 'string' && HEX_PATTERN.test(literal.value)) {
          context.report({ node, messageId: 'noRawHex' });
        }
      },
      // Match hex literals inside object-property positions such as
      // `style={{ color: "#fff" }}`. The string Literal here lives
      // inside an ObjectExpression's Property, not a JSXAttribute.
      'Property > Literal'(node: Rule.Node) {
        const literal = node as Rule.Node & { value?: unknown };
        if (typeof literal.value === 'string' && HEX_PATTERN.test(literal.value)) {
          context.report({ node, messageId: 'noRawHex' });
        }
      },
    };
  },
};

const plugin = {
  rules: {
    'no-raw-href': noRawHref,
    'no-raw-fetch': noRawFetch,
    'no-raw-hex': noRawHex,
  },
} as const;

export default plugin;