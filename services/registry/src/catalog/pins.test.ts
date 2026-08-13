import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { resolvePinTarget } from './pins.js';
import type { UserLibraryItem } from '../store/types.js';

function makeDeps(): ServiceDeps {
  return defaultDeps(new InMemoryStore());
}

describe('pins', () => {
  describe('resolvePinTarget', () => {
    describe('track-latest', () => {
      it('returns latest version', async () => {
        const result = await resolvePinTarget(makeDeps(), { pinMode: 'track-latest' }, [
          '1.0.0',
          '2.0.0',
          '1.5.0',
        ]);
        expect(result.version).toBe('2.0.0');
        expect(result.mode).toBe('track-latest');
        expect(result.reason).toBe('latest');
      });
      it('throws when no versions', async () => {
        await expect(resolvePinTarget(makeDeps(), { pinMode: 'track-latest' }, [])).rejects.toThrow(
          'No available versions',
        );
      });
    });

    describe('pin-version', () => {
      it('returns exact version', async () => {
        const result = await resolvePinTarget(
          makeDeps(),
          { pinMode: 'pin-version', pinValue: '1.2.3' },
          ['1.0.0', '1.2.3', '2.0.0'],
        );
        expect(result.version).toBe('1.2.3');
        expect(result.mode).toBe('pin-version');
        expect(result.reason).toBe('pinned-version');
      });
      it('throws when version not published', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'pin-version', pinValue: '3.0.0' }, ['1.0.0']),
        ).rejects.toThrow('not published');
      });
      it('throws when pinValue missing', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'pin-version' }, ['1.0.0']),
        ).rejects.toThrow('requires pinValue');
      });
    });

    describe('pin-range', () => {
      it('returns latest matching version', async () => {
        const result = await resolvePinTarget(
          makeDeps(),
          { pinMode: 'pin-range', pinValue: '^1.0.0' },
          ['1.0.0', '1.2.0', '2.0.0'],
        );
        expect(result.version).toBe('1.2.0');
        expect(result.mode).toBe('pin-range');
        expect(result.reason).toBe('range');
      });
      it('throws when no version satisfies range', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'pin-range', pinValue: '^3.0.0' }, ['1.0.0']),
        ).rejects.toThrow('No version satisfies');
      });
      it('throws when pinValue missing', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'pin-range' }, ['1.0.0']),
        ).rejects.toThrow('requires pinValue');
      });
    });

    describe('workspace-managed', () => {
      it('returns workspace target', async () => {
        const result = await resolvePinTarget(
          makeDeps(),
          { pinMode: 'workspace-managed' },
          ['1.0.0', '2.0.0'],
          { workspaceTarget: '2.0.0' },
        );
        expect(result.version).toBe('2.0.0');
        expect(result.mode).toBe('workspace-managed');
        expect(result.reason).toBe('workspace-policy');
      });
      it('throws when no workspace target provided', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'workspace-managed' }, ['1.0.0']),
        ).rejects.toThrow('requires a workspace target');
      });
      it('throws when workspace target not published', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'workspace-managed' }, ['1.0.0'], {
            workspaceTarget: '3.0.0',
          }),
        ).rejects.toThrow('not published');
      });
    });

    describe('unknown mode', () => {
      it('throws for unknown pin mode', async () => {
        await expect(
          resolvePinTarget(makeDeps(), { pinMode: 'unknown' as UserLibraryItem['pinMode'] }, [
            '1.0.0',
          ]),
        ).rejects.toThrow('Unknown pin mode');
      });
    });
  });
});
