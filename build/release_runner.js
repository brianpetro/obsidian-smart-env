import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import {
  log_github_error,
  remove_existing_release_and_tag,
} from './github_release_utils.js';
import { compile_latest_release } from './compile_latest_release.js';
import { parse_cli_options } from './release_notes.js';

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


const read_existing_release_body = ({ release_notes_output_path }) => {
  if (!fs.existsSync(release_notes_output_path)) {
    throw new Error(`Missing precompiled release notes: ${release_notes_output_path}`);
  }

  const release_body = fs.readFileSync(release_notes_output_path, 'utf8').trim();
  if (!release_body) {
    throw new Error(`Precompiled release notes are empty: ${release_notes_output_path}`);
  }

  return release_body;
};

const prepare_release_notes_dir = async ({
  confirmed_version,
  releases_dir,
  release_notes_output_path,
  plugin_name,
  plugin_id,
}) => {
  fs.mkdirSync(releases_dir, { recursive: true });

  const result = compile_latest_release({
    version: confirmed_version,
    plugin_name,
    plugin_id,
    releases_dir,
    output_path: release_notes_output_path,
  });

  return {
    release_body: result.release_body,
    version_notes: result.current_patch_md,
    target_file: result.canonical_release_path,
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


const github_json_request = async ({
  url,
  github_token,
  method,
  body,
}) => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18+ for release scripts.');
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${github_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const response_text = response.status === 204 ? '' : await response.text();
  let data = null;
  if (response_text) {
    try {
      data = JSON.parse(response_text);
    } catch (error) {
      data = response_text;
    }
  }

  if (!response.ok) {
    const error = new Error(`GitHub API request failed (${response.status} ${response.statusText})`);
    error.response = {
      status: response.status,
      statusText: response.statusText,
      data,
    };
    throw error;
  }

  return { data };
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
    return await github_json_request({
      url: `https://api.github.com/repos/${github_repo}/releases`,
      github_token,
      method: 'POST',
      body: release_data,
    });
  } catch (err) {
    if (log_error) {
      log_error(err, 'creating release');
    }
    throw err;
  }
};


const publish_release = async ({
  github_repo,
  github_token,
  release_id,
  log_error,
}) => {
  try {
    return await github_json_request({
      url: `https://api.github.com/repos/${github_repo}/releases/${release_id}`,
      github_token,
      method: 'PATCH',
      body: { draft: false },
    });
  } catch (err) {
    if (log_error) {
      log_error(err, 'publishing release');
    }
    throw err;
  }
};

const upload_release_assets = async ({
  upload_url,
  github_token,
  dist_dir = './dist',
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

  const required_assets = ['manifest.json', 'main.js'];
  required_assets.forEach((asset_name) => {
    const asset_path = path.join(dist_dir, asset_name);
    if (!fs.existsSync(asset_path)) {
      throw new Error(`Missing required release asset: ${asset_path}`);
    }
  });

  const release_asset_names = ['manifest.json', 'main.js', 'styles.css'];
  for (const asset_name of release_asset_names) {
    const asset_path = path.join(dist_dir, asset_name);
    if (fs.existsSync(asset_path)) {
      await upload_asset_curl(asset_path, asset_name);
    }
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
  const use_existing_release_notes = cli_args.includes('--use-existing-release-notes');

  const package_json = read_json_file('./package.json');
  const manifest_json = read_json_file('./manifest.json');
  const version = package_json.version;
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
  if (use_existing_release_notes) {
    release_body = read_existing_release_body({ release_notes_output_path });
  } else if (release_notes_source === 'releases_md') {
    const notes_result = await build_release_body_from_md({
      rl,
      release_notes_path,
      version: confirmed_version,
    });
    release_body = notes_result.release_body;
  } else {
    const notes_result = await prepare_release_notes_dir({
      confirmed_version,
      releases_dir,
      release_notes_output_path,
      plugin_name: manifest_json.name,
      plugin_id: manifest_json.id,
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
    console.error('GH_TOKEN or GH_REPO missing from environment');
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
    draft: true,
    log_error,
  });

  const { upload_url, html_url, id: release_id } = release_resp.data;
  console.log('Draft release created:', html_url);

  await upload_release_assets({
    upload_url,
    github_token,
    dist_dir,
  });

  if (cli_options.draft) {
    console.log('Release left as draft:', html_url);
    return;
  }

  const published_release_resp = await publish_release({
    github_repo,
    github_token,
    release_id,
    log_error,
  });

  console.log('Release published:', published_release_resp.data.html_url);
};
