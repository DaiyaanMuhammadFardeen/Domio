'use client';

/**
 * Cursor chat — press-and-hold T to type, Enter to send.
 * Chat bubble rendered at sender's cursor position.
 *
 * This component renders chat bubbles from both local and remote users.
 * Local messages are created via the LocalChatAdapter; remote messages
 * arrive through the presence provider.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { LocalChatMessage } from '@domio/canvas';

export interface CursorChatMessage extends LocalChatMessage {
  authorId: string;
  authorColor: string;
}

export interface CursorChatProps {
  /** Current cursor position. */
  cursor: { x: number; y: number };
  /** Whether the local chat input is open. */
  isOpen: boolean;
  /** Callback to submit a message. */
  onSubmit: (text: string) => void;
  /** Callback to close the chat input. */
  onClose: () => void;
  /** Remote messages to display. */
  messages: CursorChatMessage[];
  /** Duration to show each bubble (ms). */
  bubbleDurationMs?: number;
}

export function CursorChat({
  cursor,
  isOpen,
  onSubmit,
  onClose,
  messages,
  bubbleDurationMs = 5000,
}: CursorChatProps): ReactElement | null {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibleBubbles, setVisibleBubbles] = useState<CursorChatMessage[]>([]);

  // Show/hide bubbles based on their timestamp
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setVisibleBubbles(
        messages.filter((m) => now - m.timestamp < bubbleDurationMs),
      );
    }, 200);
    return () => clearInterval(interval);
  }, [messages, bubbleDurationMs]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (text) {
      onSubmit(text);
      setInputValue('');
    }
  }, [inputValue, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  return (
    <>
      {/* Chat input bubble */}
      {isOpen && (
        <div
          className="cursor-chat-input"
          style={{
            position: 'absolute',
            left: cursor.x,
            top: cursor.y + 24,
            zIndex: 1000,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="cursor-chat-input__field"
            autoComplete="off"
          />
        </div>
      )}

      {/* Remote chat bubbles */}
      {visibleBubbles.map((msg, i) => (
        <div
          key={`${msg.authorId}-${msg.timestamp}-${i}`}
          className="cursor-chat-bubble"
          style={{
            position: 'absolute',
            left: msg.cursor.x,
            top: msg.cursor.y + 24,
            backgroundColor: msg.authorColor,
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: '200px',
            wordBreak: 'break-word',
            zIndex: 999,
            pointerEvents: 'none',
          }}
        >
          {msg.text}
        </div>
      ))}
    </>
  );
}
