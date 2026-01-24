import fs from 'fs';
import path from 'path';
import readline from 'readline';
import archiver from 'archiver';
import axios from 'axios';
import { exec } from 'child_process';
import 'dotenv/config';
import {
  log_github_error,
  remove_existing_release_and_tag,
} from './github_release_utils.js';
import {
  build_combined_notes,
  latest_release_file,
  parse_cli_options,
  write_plugin_release_notes,
} from './release_notes.js';

const sleep = (duration_ms) => new Promise((resolve) => setTimeout(resolve, duration_ms));

const read_json_file = (file_path) => {
  return JSON.parse(fs.readFileSync(file_path, 'utf8'));
};

const create_readline = () => {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
};

const prompt_value = ({ rl, prompt, fallback = '' }) => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      const trimmed = (answer ?? '').trim();
      resolve(trimmed || fallback);
    });
  });
};

const get_release_notes_for_version = ({ release_notes_path, version }) => {
  if (!fs.existsSync(release_notes_path)) {
    return '';
  }

  const file_lines = fs.readFileSync(release_notes_path, 'utf8').split('\n');
  let found_heading = false;
  let current_heading_level = 0;
  const collected_lines = [];
  const possible_matches = [version.toLowerCase(), `v${version.toLowerCase()}`];

  for (const line of file_lines) {
    const heading_match = line.match(/^(#+)\s+(.*)$/);
    if (heading_match) {
      const heading_level = heading_match[1].length;
      const heading_content = heading_match[2].toLowerCase();
      const includes_version = possible_matches.some((match) => heading_content.includes(match));

      if (!found_heading) {
        if (includes_version) {
          found_heading = true;
          current_heading_level = heading_level;
          continue;
        }
      } else if (heading_level <= current_heading_level) {
        break;
      }
    } else if (!found_heading) {
      continue;
    }

    if (found_heading) {
      collected_lines.push(line);
    }
  }

  return collected_lines.join('\n').trim();
};

const build_release_body_from_md = async ({ rl, release_notes_path, version }) => {
  const version_notes = get_release_notes_for_version({ release_notes_path, version });
  const user_description = await prompt_value({
    rl,
    prompt: 'Enter additional release description (optional): ',
  });

  const release_body_parts = [];
  if (user_description) {
    release_body_parts.push(user_description);
  }
  if (version_notes) {
    release_body_parts.push(version_notes);
  }

  return {
    release_body: release_body_parts.join('\n\n').trim(),
    version_notes,
  };
};

const prepare_release_notes_dir = async ({
  rl,
  confirmed_version,
  releases_dir,
  release_notes_output_path,
}) => {
  fs.mkdirSync(releases_dir, { recursive: true });

  const release_file = path.join(releases_dir, `${confirmed_version}.md`);
  let version_notes = '';

  if (fs.existsSync(release_file)) {
    version_notes = fs.readFileSync(release_file, 'utf8').trim();
  } else {
    const prior_file = latest_release_file(releases_dir, confirmed_version);
    let prior_notes = prior_file ? fs.readFileSync(prior_file, 'utf8').trim() : '';

    if (prior_notes.includes('## next patch')) {
      prior_notes = prior_notes.replace(
        '## next patch',
        `## patch \`v${confirmed_version}\`\n`,
      );
      version_notes = prior_notes;
    } else {
      const user_desc = await prompt_value({
        rl,
        prompt: 'Enter additional release description (optional): ',
      });
      version_notes = build_combined_notes(confirmed_version, prior_notes, user_desc);
    }

    if (prior_file) {
      fs.writeFileSync(prior_file, version_notes);
    } else {
      fs.writeFileSync(release_file, version_notes);
    }
  }

  const target_file = fs.existsSync(release_file)
    ? release_file
    : latest_release_file(releases_dir, confirmed_version);

  if (target_file) {
    write_plugin_release_notes({
      release_path: target_file,
      output_path: release_notes_output_path,
      version: confirmed_version,
    });
  } else {
    console.warn('No release notes file found to format into latest_release.md');
  }

  return {
    release_body: version_notes,
    version_notes,
    target_file,
  };
};

const run_build_command = ({ build_command }) => {
  return new Promise((resolve, reject) => {
    exec(build_command, (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stdout) console.log(stdout);
      if (stderr) console.log(stderr);
      console.log('build finished');
      resolve();
    });
  });
};

const create_release = async ({
  github_repo,
  github_token,
  confirmed_version,
  release_body,
  draft,
  log_error,
}) => {
  const release_data = {
    tag_name: confirmed_version,
    name: confirmed_version,
    body: release_body,
    draft,
    prerelease: false,
  };

  try {
    return await axios.post(
      `https://api.github.com/repos/${github_repo}/releases`,
      release_data,
      { headers: { Authorization: `Bearer ${github_token}`, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    if (log_error) {
      log_error(err, 'creating release');
    }
    throw err;
  }
};

const upload_release_assets = async ({
  upload_url,
  github_token,
  manifest_id,
  confirmed_version,
  dist_dir = './dist',
  zip_cleanup_delay_ms = 3000,
}) => {
  const upload_asset_curl = (asset_path, asset_name) => {
    return new Promise((resolve, reject) => {
      const url = `${upload_url.split('{')[0]}?name=${encodeURIComponent(asset_name)}`;
      const cmd = [
        'curl',
        '-X', 'POST',
        '-H', `"Authorization: Bearer ${github_token}"`,
        '-H', '"Content-Type: application/octet-stream"',
        '--data-binary', `@${asset_path}`,
        `"${url}"`,
      ].join(' ');
      exec(cmd, (err, stdout, stderr) => {
        if (err) return reject(err);
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
        console.log(`Uploaded ${asset_name}`);
        resolve();
      });
    });
  };

  const zip_name = `${manifest_id}-${confirmed_version}.zip`;
  const zip_stream = fs.createWriteStream(`./${zip_name}`);
  const archive = archiver('zip', { zlib: { level: 0 } });

  await new Promise((resolve, reject) => {
    archive.pipe(zip_stream);
    archive.directory(dist_dir, false);
    archive.on('error', reject);
    zip_stream.on('close', resolve);
    archive.finalize();
  });

  console.log(`Archive wrote ${archive.pointer()} bytes`);
  await upload_asset_curl(`./${zip_name}`, zip_name);

  for (const file of fs.readdirSync(dist_dir)) {
    await upload_asset_curl(path.join(dist_dir, file), file);
  }

  if (zip_cleanup_delay_ms) {
    setTimeout(() => fs.unlinkSync(`./${zip_name}`), zip_cleanup_delay_ms);
  }
};

export const run_core_release = async (params = {}) => {
  const {
    cli_args = process.argv.slice(2),
    releases_dir = './releases',
    release_notes_output_path = './releases/latest_release.md',
    release_notes_source = 'releases_dir',
    release_notes_path = './releases.md',
    run_build = true,
    build_command = 'npm run build',
    dist_dir = './dist',
    log_error = log_github_error,
  } = params;

  const cli_options = parse_cli_options(cli_args);

  const package_json = read_json_file('./package.json');
  const manifest_json = read_json_file('./manifest.json');
  const version = package_json.version;
  const manifest_id = manifest_json.id;

  if (version !== manifest_json.version) {
    console.error('Version mismatch between package.json and manifest.json');
    process.exit(1);
  }

  const rl = create_readline();
  const confirmed_version = await prompt_value({
    rl,
    prompt: `Confirm release version (${version}): `,
    fallback: version,
  });
  console.log(`Creating release for ${confirmed_version}`);

  let release_body = '';
  if (release_notes_source === 'releases_md') {
    const notes_result = await build_release_body_from_md({
      rl,
      release_notes_path,
      version: confirmed_version,
    });
    release_body = notes_result.release_body;
  } else {
    const notes_result = await prepare_release_notes_dir({
      rl,
      confirmed_version,
      releases_dir,
      release_notes_output_path,
    });
    release_body = notes_result.release_body;
  }

  rl.close();
  await sleep(500);

  if (run_build) {
    await run_build_command({ build_command });
  }

  const github_token = process.env.GH_TOKEN;
  const github_repo = process.env.GH_REPO;
  if (!github_token || !github_repo) {
    console.error('GH_TOKEN or GH_REPO missing from .env');
    process.exit(1);
  }

  if (cli_options.replace_existing) {
    console.log(
      `--replace-existing set; removing any existing release and tag for ${confirmed_version}`,
    );
    await remove_existing_release_and_tag({
      github_repo,
      github_token,
      tag_name: confirmed_version,
    });
  }

  const release_resp = await create_release({
    github_repo,
    github_token,
    confirmed_version,
    release_body,
    draft: cli_options.draft,
    log_error,
  });

  const { upload_url, html_url } = release_resp.data;
  console.log('Release created:', html_url);

  await upload_release_assets({
    upload_url,
    github_token,
    manifest_id,
    confirmed_version,
    dist_dir,
  });
};
