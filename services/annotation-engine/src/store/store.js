/**
 * @domio/annotation-engine — store interface.
 *
 * The annotation store is keyed by `(session_id, slide_id, ephemeral)`.
 * Ephemeral overlays are wiped on session end. Saved overlays survive.
 *
 * Operations:
 *   - create  — append a stroke; bumps session version.
 *   - getById — read a single annotation.
 *   - listForSession — full ephemeral set for the live canvas.
 *   - listSavedForSlide — saved overlays attached to a slide.
 *   - rollback — delete by id (presenter "undo").
 *   - promote — mark ephemeral as saved (returns saved_overlay_id).
 *   - clearEphemeral — wipe on session end.
 */
export function makeStoreError(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
}
export function isStore(x) {
    if (!x || typeof x !== 'object')
        return false;
    const o = x;
    return (typeof o.create === 'function' &&
        typeof o.getById === 'function' &&
        typeof o.listForSession === 'function' &&
        typeof o.rollback === 'function' &&
        typeof o.promote === 'function' &&
        typeof o.clearEphemeral === 'function');
}
//# sourceMappingURL=store.js.map