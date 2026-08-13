import { describe, it, expect } from 'vitest';
import { AuditRecorderImpl, InMemoryAuditSink } from './audit.js';
import { asULID } from '@domio/schema';

describe('AuditRecorderImpl', () => {
  it('records branch.create events with timestamps', () => {
    const sink = new InMemoryAuditSink();
    const recorder = new AuditRecorderImpl(sink, () => new Date('2026-04-01T00:00:00Z'));
    recorder.record({
      actorId: 'user-1',
      action: 'branch.create',
      targetKind: 'branch',
      targetId: asULID('01H00000000000000000000001'),
      metadata: { source: 'feature/x' },
    });
    expect(sink.listByAction('branch.create')).toHaveLength(1);
    expect(sink.listByAction('merge.commit')).toHaveLength(0);
  });

  it('captures merge.commit', () => {
    const sink = new InMemoryAuditSink();
    const recorder = new AuditRecorderImpl(sink);
    recorder.record({
      actorId: 'user-2',
      action: 'merge.commit',
      targetKind: 'merge_request',
      targetId: asULID('01H00000000000000000000002'),
      metadata: { sourceBranch: 'b1', targetBranch: 'main' },
    });
    recorder.record({
      actorId: 'user-3',
      action: 'checkpoint.restore',
      targetKind: 'checkpoint',
      targetId: asULID('01H00000000000000000000003'),
      metadata: {},
    });
    expect(sink.listByAction('merge.commit')).toHaveLength(1);
    expect(sink.listByAction('checkpoint.restore')).toHaveLength(1);
  });

  it('reset clears events', () => {
    const sink = new InMemoryAuditSink();
    const recorder = new AuditRecorderImpl(sink);
    recorder.record({
      actorId: 'u',
      action: 'branch.archive',
      targetKind: 'branch',
      targetId: asULID('01H00000000000000000000004'),
      metadata: {},
    });
    sink.reset();
    expect(sink.list()).toHaveLength(0);
  });
});
