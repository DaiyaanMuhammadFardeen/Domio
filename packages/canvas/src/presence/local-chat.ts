/**
 * Local chat — T held opens the local chat input. See
 * docs/development_phases/phase-03 §F.3. P04 will replace the
 * `LocalPresenceAdapter` with a `RemotePresenceAdapter` speaking the WS
 * protocol.
 */

import type { NormalizedKeyboardEvent } from '../input/keyboard.js';

export interface LocalChatMessage {
  text: string;
  cursor: { x: number; y: number };
  timestamp: number;
}

export class LocalChatAdapter {
  private messages: LocalChatMessage[] = [];
  private open = false;
  private cursor: { x: number; y: number } = { x: 0, y: 0 };

  setCursor(cursor: { x: number; y: number }): void {
    this.cursor = cursor;
  }

  isOpen(): boolean {
    return this.open;
  }

  feed(event: NormalizedKeyboardEvent): 'open' | 'close' | 'ignore' {
    if (event.key === 'T' && event.meta !== true && event.ctrl !== true) {
      this.open = true;
      return 'open';
    }
    if (event.key === 'Escape' && this.open) {
      this.open = false;
      return 'close';
    }
    return 'ignore';
  }

  submit(text: string): LocalChatMessage {
    const message: LocalChatMessage = {
      text,
      cursor: this.cursor,
      timestamp: Date.now(),
    };
    this.messages.push(message);
    this.open = false;
    return message;
  }

  messages_(): LocalChatMessage[] {
    return [...this.messages];
  }
}
