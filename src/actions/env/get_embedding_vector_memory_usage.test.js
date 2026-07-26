import test from 'ava';
import {
  action_scope,
  env_get_embedding_vector_memory_usage,
} from './get_embedding_vector_memory_usage.js';

test('returns used, allocated, and unused capacity bytes across loaded collection vector files', (t) => {
  const env = {
    collections: {
      event_logs: 'loaded',
      smart_blocks: 'loaded',
      smart_sources: 'loaded',
    },
    event_logs: {},
    smart_blocks: {
      embeddings: {
        _vectors_by_file: {
          active: new Float32Array(6),
        },
        get_vector_value_count(file) {
          return { active: 3 }[file];
        },
      },
    },
    smart_sources: {
      embeddings: {
        _vectors_by_file: {
          active: new Float32Array(8),
          previous: new Float32Array(4),
        },
        get_vector_value_count(file) {
          return {
            active: 6,
            previous: 2,
          }[file];
        },
      },
    },
  };

  t.deepEqual(
    env_get_embedding_vector_memory_usage.call(env),
    {
      used_bytes: 11 * Float32Array.BYTES_PER_ELEMENT,
      allocated_bytes: 18 * Float32Array.BYTES_PER_ELEMENT,
      unused_capacity_bytes: 7 * Float32Array.BYTES_PER_ELEMENT,
    },
  );
});

test('is scoped to the environment', (t) => {
  t.deepEqual(action_scope, { type: 'env' });
});
