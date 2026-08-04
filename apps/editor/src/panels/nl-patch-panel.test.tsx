import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NlPatchPanel, type NlToolCallSummary } from './nl-patch-panel.js';

describe('NlPatchPanel', () => {
  it('renders the textarea and buttons', () => {
    render(<NlPatchPanel deckId="deck-1" />);
    expect(screen.getByTestId('m8-nl-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('m8-nl-patch')).toBeInTheDocument();
    expect(screen.getByTestId('m8-nl-apply')).toBeInTheDocument();
    expect(screen.getByTestId('m8-nl-rollback')).toBeInTheDocument();
  });

  it('parses the prompt and renders diff', async () => {
    const parsed: NlToolCallSummary[] = [
      { toolName: 'create_hotspot', input: { deckId: 'deck-1' } },
    ];
    const onParse = vi.fn(async () => parsed);
    render(<NlPatchPanel deckId="deck-1" onParse={onParse} />);
    fireEvent.change(screen.getByTestId('m8-nl-prompt'), {
      target: { value: 'add hotspot foo' },
    });
    fireEvent.click(screen.getByTestId('m8-nl-patch'));
    await waitFor(() => expect(screen.getAllByTestId('m8-nl-call').length).toBe(1));
    expect(screen.getByTestId('m8-nl-call-tool').textContent).toBe('create_hotspot');
    expect(onParse).toHaveBeenCalledWith('add hotspot foo');
  });

  it('invokes onApply when Apply is clicked', async () => {
    const calls: NlToolCallSummary[] = [
      { toolName: 'create_rule', input: { deckId: 'd' } },
    ];
    const onParse = vi.fn(async () => calls);
    const onApply = vi.fn(async () => undefined);
    render(<NlPatchPanel deckId="d" onParse={onParse} onApply={onApply} />);
    fireEvent.change(screen.getByTestId('m8-nl-prompt'), {
      target: { value: 'add rule' },
    });
    fireEvent.click(screen.getByTestId('m8-nl-patch'));
    await waitFor(() => screen.getByTestId('m8-nl-call'));
    fireEvent.click(screen.getByTestId('m8-nl-apply'));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(calls));
  });

  it('invokes onRollback when Rollback is clicked', async () => {
    const calls: NlToolCallSummary[] = [
      { toolName: 'create_rule', input: { deckId: 'd' } },
    ];
    const onParse = vi.fn(async () => calls);
    const onRollback = vi.fn(async () => undefined);
    render(<NlPatchPanel deckId="d" onParse={onParse} onRollback={onRollback} />);
    fireEvent.change(screen.getByTestId('m8-nl-prompt'), {
      target: { value: 'add rule' },
    });
    fireEvent.click(screen.getByTestId('m8-nl-patch'));
    await waitFor(() => screen.getByTestId('m8-nl-call'));
    fireEvent.click(screen.getByTestId('m8-nl-rollback'));
    await waitFor(() => expect(onRollback).toHaveBeenCalledWith(calls));
  });

  it('shows an error when onParse rejects', async () => {
    const onParse = vi.fn(async () => {
      throw new Error('boom');
    });
    render(<NlPatchPanel deckId="d" onParse={onParse} />);
    fireEvent.change(screen.getByTestId('m8-nl-prompt'), {
      target: { value: 'whatever' },
    });
    fireEvent.click(screen.getByTestId('m8-nl-patch'));
    await waitFor(() => expect(screen.getByTestId('m8-nl-error')).toBeInTheDocument());
  });

  it('disables apply/rollback when no parsed calls', () => {
    render(<NlPatchPanel deckId="d" />);
    expect(screen.getByTestId('m8-nl-apply')).toBeDisabled();
    expect(screen.getByTestId('m8-nl-rollback')).toBeDisabled();
  });
});