import test from 'ava';
import {
  add_exclusion,
  ensure_smart_sources_settings,
  format_folder_exclusion,
  remove_exclusion,
} from './exclusions.js';

const comma_file_path = 'Cases/Lastname, Firstname/Doe v. X, 193 S.W.3d 727.md';

test('add_exclusion and remove_exclusion normalize legacy values to arrays', (t) => {
  t.deepEqual(add_exclusion('alpha,beta', 'gamma'), ['alpha', 'beta', 'gamma']);
  t.deepEqual(add_exclusion([comma_file_path], comma_file_path), [comma_file_path]);
  t.deepEqual(remove_exclusion([comma_file_path, 'other.md'], comma_file_path), ['other.md']);
});

test('ensure_smart_sources_settings normalizes both exclusion fields', (t) => {
  const env = {
    settings: {
      smart_sources: {
        folder_exclusions: 'Folder',
        file_exclusions: [comma_file_path],
      },
    },
  };

  const settings = ensure_smart_sources_settings(env);

  t.deepEqual(settings.folder_exclusions, ['Folder']);
  t.deepEqual(settings.file_exclusions, [comma_file_path]);
});

test('format_folder_exclusion adds one recursive suffix', (t) => {
  t.is(format_folder_exclusion('Folder'), 'Folder/**');
  t.is(format_folder_exclusion('Folder/'), 'Folder/**');
  t.is(format_folder_exclusion('Folder/**'), 'Folder/**');
  t.is(format_folder_exclusion('/'), '');
});
