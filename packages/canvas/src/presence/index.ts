/**
 * Presence module — local chat + ping adapters.
 *
 * The local UX works; remote broadcast is a P04 concern and is explicitly
 * not implemented. The `LocalPresenceAdapter` interface (LocalChatAdapter +
 * LocalPingAdapter) is the seam P04 uses to swap in a `RemotePresenceAdapter`.
 */

export * from './local-chat.js';
export * from './ping.js';
