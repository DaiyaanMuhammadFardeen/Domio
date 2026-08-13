/**
 * @domio/join-web — captions/MtClient.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Mock machine-translation client. The real implementation will call
 * `services/mt-provider`; this mock returns a deterministic
 * transformation so the captions pipeline is testable end-to-end.
 */

export interface MtTranslateInput {
  readonly text: string;
  readonly from: string;
  readonly to: string;
}

export type MtTranslateFn = (input: MtTranslateInput) => Promise<string>;

const DEFAULT_FN: MtTranslateFn = async ({ text, from, to }) => {
  if (!text) return '';
  if (from === to) return text;
  return `[${to}] ${text}`;
};

/**
 * Translate text from one BCP-47 code to another. The mock just
 * prefixes the target locale; the call is async so the real client
 * can drop in without API changes.
 */
export const translate: MtTranslateFn = DEFAULT_FN;
