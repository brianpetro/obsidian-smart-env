import test from 'ava';
import { SmartFs } from 'smart-file-system';
import { ObsidianFsAdapter } from './obsidian.js';

class TestFile {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
    this.basename = this.name.split('.').shift();
    this.extension = this.name.split('.').pop();
    this.stat = { ctime: 0, mtime: 0, size: 1 };
  }
}

class TestFolder {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
  }
}

const configured_excluded_long_path = [
  'Cases/Lastname, Firstname',
  'Doe v. X, 193 S.W.3d 727, 727 (Tex. App. 2006), review granted',
  'x'.repeat(160) + '.md',
].join('/');

const included_long_path = [
  'Other Cases',
  'Roe v. Y, 200 S.W.3d 100, 101 (Tex. App. 2007)',
  'y'.repeat(160) + '.md',
].join('/');

const runtime_long_path = `Runtime/${'z'.repeat(220)}.md`;
const included_comma_path = 'Cases/Other/Doe v. X, 193 S.W.3d 727, 727 (Tex. App. 2006).md';

test('core includes long paths while preserving configured exclusions', async (t) => {
  const vault_files = [
    new TestFolder('Cases'),
    new TestFolder('Cases/Lastname, Firstname'),
    new TestFile(configured_excluded_long_path),
    new TestFile(included_long_path),
    new TestFile(included_comma_path),
  ];
  const app = {
    vault: {
      adapter: {},
      getAllLoadedFiles() {
        return vault_files;
      },
    },
  };
  const env = {
    main: { app },
    settings: {
      gitignore_exclusions: [],
      skip_excluding_gitignore: true,
    },
  };
  const smart_fs = new SmartFs(env, {
    adapter: ObsidianFsAdapter,
    exclude_patterns: ['Cases/Lastname, Firstname/**'],
  });
  smart_fs.adapter.obsidian = { TFile: TestFile, TFolder: TestFolder };

  await smart_fs.load_files();

  t.true(smart_fs.file_paths.includes(included_long_path));
  t.true(smart_fs.file_paths.includes(included_comma_path));
  t.false(smart_fs.file_paths.includes(configured_excluded_long_path));
  t.false(smart_fs.is_excluded(runtime_long_path));
  t.deepEqual(smart_fs.auto_excluded_files, []);
});

class PathLengthLimitObsidianFsAdapter extends ObsidianFsAdapter {
  should_exclude_path_for_length(file_path) {
    return file_path.length > 200;
  }
}

test('SmartFs honors an adapter path-length policy override', async (t) => {
  const long_path = `Long/${'q'.repeat(220)}.md`;
  const vault_files = [new TestFile(long_path)];
  const app = {
    vault: {
      adapter: {},
      getAllLoadedFiles() {
        return vault_files;
      },
    },
  };
  const env = {
    main: { app },
    settings: {
      gitignore_exclusions: [],
      skip_excluding_gitignore: true,
    },
  };
  const smart_fs = new SmartFs(env, {
    adapter: PathLengthLimitObsidianFsAdapter,
  });
  smart_fs.adapter.obsidian = { TFile: TestFile, TFolder: TestFolder };

  await smart_fs.load_files();

  t.false(smart_fs.file_paths.includes(long_path));
  t.true(smart_fs.is_excluded(long_path));
  t.deepEqual(smart_fs.auto_excluded_files, [long_path]);
});
