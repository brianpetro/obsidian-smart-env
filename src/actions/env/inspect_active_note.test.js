import test from 'ava';
import { force_re_import_source } from './inspect_active_note.js';

test('force re-import queues the inspected source and runs the collection immediately', async (t) => {
  const calls = [];
  const source = {
    key: 'Notes/Test.md',
  };
  source.collection = {
    queue_source_re_import(queued_source, event_meta) {
      calls.push({
        action: 'queue',
        event_meta,
        source: queued_source,
      });
    },
    async run_re_import() {
      calls.push({ action: 'run' });
    },
  };

  await force_re_import_source(source);

  t.deepEqual(calls, [
    {
      action: 'queue',
      event_meta: {
        event_source: 'source_inspector.force_re_import',
      },
      source,
    },
    {
      action: 'run',
    },
  ]);
});

test('force re-import rejects a source without an available collection pipeline', async (t) => {
  const error = await t.throwsAsync(
    force_re_import_source({ key: 'Notes/Test.md' }),
  );

  t.is(error.message, 'Source re-import is unavailable');
});

test('force re-import rejects when the source remains queued after the run', async (t) => {
  const source = {
    key: 'Notes/Test.md',
    _queue_import: false,
  };
  source.collection = {
    queue_source_re_import() {},
    async run_re_import() {
      source._queue_import = true;
    },
  };

  const error = await t.throwsAsync(force_re_import_source(source));

  t.is(error.message, 'Source re-import did not complete and remains queued');
});
