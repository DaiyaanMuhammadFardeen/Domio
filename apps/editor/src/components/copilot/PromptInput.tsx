'use client';

/**
 * PromptInput — text + voice + file prompt composer for the AI Copilot.
 *
 * Per Wave 6 §S6.1 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Emits `onSubmit({ text, voice, file, intent })` where exactly one of
 * `text`/`voice`/`file` is provided based on what the user did.
 *
 *   - text  : the typed prompt (intent === 'prompt')
 *   - voice : a recorded audio Blob (intent === 'voice')
 *   - file  : a dropped File (intent === 'file')
 *
 * Voice uses `MediaRecorder`; gracefully degrades when
 * `navigator.mediaDevices` is unavailable.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  ReactElement,
} from 'react';
import { Mic, Square, Paperclip, Send, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type PromptIntent = 'prompt' | 'voice' | 'file';

export interface PromptSubmission {
  readonly intent: PromptIntent;
  readonly text?: string;
  readonly voice?: Blob;
  readonly file?: File;
}

export interface PromptInputProps {
  readonly onSubmit?: (submission: PromptSubmission) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md'];
const ACCEPTED_FILE_MIME_PREFIXES = ['application/pdf', 'text/', 'application/msword'];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_FILE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return true;
  }
  return ACCEPTED_FILE_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));
}

export function PromptInput({
  onSubmit,
  disabled = false,
  placeholder = 'Describe what you want to present…',
}: PromptInputProps): ReactElement {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedFileError, setStagedFileError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up any active recording on unmount.
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleSubmit = useCallback(
    (e?: FormEvent | KeyboardEvent) => {
      if (e && 'preventDefault' in e) e.preventDefault();
      if (disabled) return;

      if (stagedFile) {
        onSubmit?.({ intent: 'file', file: stagedFile });
        setStagedFile(null);
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      onSubmit?.({ intent: 'prompt', text: trimmed });
      setText('');
    },
    [disabled, onSubmit, stagedFile, text],
  );

  const handleStartRecording = useCallback(async () => {
    setRecordError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordError('Microphone not available in this environment');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onSubmit?.({ intent: 'voice', voice: blob });
      };
      recorder.start();
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : String(err));
    }
  }, [onSubmit]);

  const handleStopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const handleFileInputChange = useCallback((ev: ChangeEvent<HTMLInputElement>) => {
    setStagedFileError(null);
    const file = ev.target.files?.[0] ?? null;
    if (file && !isAcceptedFile(file)) {
      setStagedFileError(`Unsupported file: ${file.name}`);
      ev.target.value = '';
      return;
    }
    setStagedFile(file);
    ev.target.value = '';
  }, []);

  const handleDrop = useCallback((ev: DragEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsDraggingFile(false);
    setStagedFileError(null);
    const file = ev.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setStagedFileError(`Unsupported file: ${file.name}`);
      return;
    }
    setStagedFile(file);
  }, []);

  const handleDragOver = useCallback((ev: DragEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingFile(false);
  }, []);

  const handleClearFile = useCallback(() => {
    setStagedFile(null);
    setStagedFileError(null);
  }, []);

  const onFormSubmit = useCallback(
    (e: FormEvent) => {
      handleSubmit(e);
    },
    [handleSubmit],
  );

  const onTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSubmit = !disabled && (text.trim().length > 0 || stagedFile !== null);

  return (
    <form
      onSubmit={onFormSubmit}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-slate-700/60 bg-slate-800/60 p-2',
        'transition-colors',
        isDraggingFile && 'border-blue-500/60 bg-slate-800/80',
      )}
      data-testid="copilot-prompt-input"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {stagedFile ? (
        <div
          className="flex items-center gap-2 rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200"
          data-testid="copilot-prompt-staged-file"
        >
          <Paperclip size={12} className="text-blue-400" />
          <span className="truncate">{stagedFile.name}</span>
          <span className="ml-auto text-[10px] text-slate-500">
            {Math.round(stagedFile.size / 1024)} KB
          </span>
          <button
            type="button"
            onClick={handleClearFile}
            className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-200"
            aria-label="Remove attached file"
            data-testid="copilot-prompt-clear-file"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {stagedFileError ? (
        <p
          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
          data-testid="copilot-prompt-file-error"
          role="alert"
        >
          {stagedFileError}
        </p>
      ) : null}

      {recordError ? (
        <p
          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
          data-testid="copilot-prompt-record-error"
          role="alert"
        >
          {recordError}
        </p>
      ) : null}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onTextareaKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className={cn(
          'w-full resize-none rounded-md border border-transparent bg-slate-900/60 px-2 py-1.5',
          'text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors',
          'focus:border-blue-500/50 disabled:opacity-60',
        )}
        aria-label="Prompt"
        data-testid="copilot-prompt-text"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-50"
          aria-label="Attach file"
          data-testid="copilot-prompt-attach"
        >
          <Paperclip size={14} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/*"
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="copilot-prompt-file-input"
        />

        {recording ? (
          <button
            type="button"
            onClick={handleStopRecording}
            className="rounded-md bg-red-600/80 p-1.5 text-white transition-colors hover:bg-red-500"
            aria-label="Stop recording"
            data-testid="copilot-prompt-stop-record"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartRecording}
            disabled={disabled}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200 disabled:opacity-50"
            aria-label="Record voice prompt"
            data-testid="copilot-prompt-record"
          >
            <Mic size={14} />
          </button>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
            'text-xs font-medium text-white transition-colors',
            canSubmit ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 opacity-50',
          )}
          data-testid="copilot-prompt-submit"
          aria-label="Submit prompt"
        >
          <Send size={12} />
          <span>Send</span>
        </button>
      </div>

      {recording ? (
        <p
          className="flex items-center gap-1.5 text-[11px] text-red-400"
          data-testid="copilot-prompt-recording-indicator"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          Recording…
        </p>
      ) : null}
    </form>
  );
}
