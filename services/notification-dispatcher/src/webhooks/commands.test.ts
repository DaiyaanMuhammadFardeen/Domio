import { describe, it, expect } from 'vitest';
import { parseSlashCommand, dispatchCommand, registerCommand, getCommand } from './commands.js';

describe('webhooks/commands', () => {
  describe('parseSlashCommand', () => {
    it('parses URL-encoded Slack body', () => {
      // Slack sends: command=/domio, text=approve abc123
      const body = 'command=/domio&text=approve+abc123&trigger_id=t-1&user_id=u-1';
      const cmd = parseSlashCommand(body);
      expect(cmd.command).toBe('domio');
      expect(cmd.text).toBe('approve abc123');
      expect(cmd.trigger_id).toBe('t-1');
      expect(cmd.user_id).toBe('u-1');
    });

    it('parses JSON Teams body', () => {
      const body = { text: '/domio open deck-42', triggerId: 't-2', userId: 'u-2' };
      const cmd = parseSlashCommand(body);
      expect(cmd.command).toBe('domio');
      expect(cmd.text).toBe('open deck-42');
      expect(cmd.trigger_id).toBe('t-2');
      expect(cmd.user_id).toBe('u-2');
    });

    it('handles missing fields gracefully', () => {
      const cmd = parseSlashCommand('command=/help');
      expect(cmd.command).toBe('help');
      expect(cmd.text).toBe('');
      expect(cmd.trigger_id).toBe('');
    });

    it('strips leading slash', () => {
      const cmd = parseSlashCommand('command=/domio');
      expect(cmd.command).toBe('domio');
    });

    it('lowercases command name', () => {
      const cmd = parseSlashCommand('command=/DOMIO');
      expect(cmd.command).toBe('domio');
    });
  });

  describe('dispatchCommand', () => {
    it('routes /domio approve {id}', async () => {
      const body = 'command=/domio&text=approve+req-42&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('text');
      expect((result.body as { text: string }).text).toContain('req-42');
    });

    it('routes /domio open {deck_id}', async () => {
      const body = 'command=/domio&text=open+deck-99&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(200);
      expect((result.body as { text: string }).text).toContain('deck-99');
    });

    it('routes /domio help', async () => {
      const body = 'command=/domio&text=help&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(200);
      expect((result.body as { text: string }).text).toContain('Commands');
    });

    it('routes bare /domio to help', async () => {
      const body = 'command=/domio&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(200);
      expect((result.body as { text: string }).text).toContain('Commands');
    });

    it('returns 400 when approve missing id', async () => {
      const body = 'command=/domio&text=approve&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(400);
    });

    it('returns 400 when open missing deck_id', async () => {
      const body = 'command=/domio&text=open&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(400);
    });

    it('returns 404 for unknown command', async () => {
      const body = 'command=/nonexistent&text=cmd&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(404);
    });

    it('routes /help directly (not through domio prefix)', async () => {
      const body = 'command=/help&trigger_id=t-1';
      const result = await dispatchCommand(body);
      expect(result.status).toBe(200);
    });

    it('handles JSON body with domio sub-command', async () => {
      const body = { text: '/domio approve req-7' };
      const result = await dispatchCommand(body);
      expect(result.status).toBe(200);
      expect((result.body as { text: string }).text).toContain('req-7');
    });
  });

  describe('registerCommand', () => {
    it('registers and retrieves a custom command', async () => {
      registerCommand('custom', async (args) => ({
        status: 200,
        body: { text: `custom: ${args}` },
      }));
      const handler = getCommand('custom');
      expect(handler).toBeDefined();
      const result = await handler!('hello', { trigger_id: 't-1' });
      expect((result.body as { text: string }).text).toBe('custom: hello');
    });

    it('getCommand returns undefined for unknown', () => {
      expect(getCommand('nonexistent')).toBeUndefined();
    });
  });
});
