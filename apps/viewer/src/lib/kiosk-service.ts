/**
 * Kiosk service — kiosk configuration + admin PIN verification.
 *
 * Per Wave 11 §S11.14 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The kiosk mode is a fullscreen, touch-driven playback loop intended
 * for trade-show booths and unattended displays. The configuration is
 * keyed per-deck and stored server-side in the kiosk-svc (forthcoming).
 * The bootstrap implementation derives a deterministic config from the
 * deckId so the UI is exercisable end-to-end before the real backend
 * is wired in.
 */

export interface KioskConfig {
  readonly deck_id: string;
  /** Numeric PIN (4–8 digits) that exits kiosk mode. */
  readonly admin_pin: string;
  /** Seconds of no interaction before the viewer auto-resets to slide 0. */
  readonly reset_after_sec: number;
  /**
   * If set, the kiosk advances automatically after N seconds (loop).
   * `null` disables auto-advance — touch only.
   */
  readonly auto_advance_sec: number | null;
  /** Whether to request fullscreen on mount. */
  readonly fullscreen: boolean;
  /** Whether to hide the cursor after 3s of inactivity. */
  readonly hide_cursor: boolean;
}

export interface VerifyPinResult {
  readonly valid: boolean;
}

const DEFAULT_PIN = '1234';
const DEFAULT_RESET_SEC = 60;
const DEFAULT_AUTO_ADVANCE_SEC: number | null = null;

/**
 * Deterministic seed: same deckId → same config every call.
 *
 * PIN is always the default in bootstrap mode. Production would
 * load this from the per-tenant kiosk-svc store.
 */
function deriveConfig(deckId: string): KioskConfig {
  // Keep the deckId contribution tiny so the deterministic shape stays
  // stable across the app; we don't want a different reset window
  // for every deck (kiosk operators expect predictability).
  void deckId;
  return {
    deck_id: deckId,
    admin_pin: DEFAULT_PIN,
    reset_after_sec: DEFAULT_RESET_SEC,
    auto_advance_sec: DEFAULT_AUTO_ADVANCE_SEC,
    fullscreen: true,
    hide_cursor: true,
  };
}

export async function getKioskConfig(deckId: string): Promise<KioskConfig> {
  return deriveConfig(deckId);
}

export async function setKioskConfig(config: KioskConfig): Promise<KioskConfig> {
  // Bootstrap: echo back. The real svc will persist + return the
  // canonical row (with any server-side normalization applied).
  void config;
  return config;
}

/**
 * Verify a candidate admin PIN against the kiosk config for the deck.
 *
 * Bootstrap implementation: a plain equality check against the derived
 * config's PIN. Real implementation will defer to the kiosk-svc so the
 * PIN never leaves the server (and brute-force attempts are rate-limited).
 */
export async function verifyAdminPin(deckId: string, pin: string): Promise<VerifyPinResult> {
  const cfg = await getKioskConfig(deckId);
  return { valid: cfg.admin_pin === pin };
}
