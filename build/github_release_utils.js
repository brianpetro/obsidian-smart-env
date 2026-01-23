/**
 * Build headers for GitHub API requests.
 * @param {string} github_token
 * @returns {{Authorization: string, 'Content-Type': string}}
 */
function build_github_headers(github_token) {
  return {
    Authorization: `Bearer ${github_token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Log details for an error against the GitHub API.
 * Expects (when available) an axios-like shape: err.response.{status,statusText,data}.
 * @param {any} err
 * @param {string} context
 */
function log_github_error(err, context) {
  const status = err?.response?.status;
  const status_text = err?.response?.statusText;
  const message = err?.message;
  const data = err?.response?.data;

  console.error(`[GH API] ${context} failed`, {
    status,
    status_text,
    message,
    data,
  });
}

/**
 * Internal: perform a GitHub API request using fetch, throwing an axios-shaped error on non-2xx.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<{status: number, status_text: string, data: any}>}
 */
async function github_fetch(url, options) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18+ (or provide a fetch polyfill).');
  }

  let resp;
  try {
    resp = await fetch(url, options);
  } catch (err) {
    // Network / DNS / connection-level failures (no HTTP response).
    throw err;
  }

  const content_type = resp.headers.get('content-type') || '';
  const has_json = /application\/json/i.test(content_type);

  let data = null;
  if (resp.status !== 204) {
    if (has_json) {
      try {
        data = await resp.json();
      } catch (err) {
        data = null;
      }
    } else {
      try {
        data = await resp.text();
      } catch (err) {
        data = null;
      }
    }
  }

  if (!resp.ok) {
    const err = new Error(`GitHub API request failed (${resp.status} ${resp.statusText})`);
    err.response = {
      status: resp.status,
      statusText: resp.statusText,
      data,
    };
    throw err;
  }

  return {
    status: resp.status,
    status_text: resp.statusText,
    data,
  };
}

/**
 * Remove an existing GitHub release and its tag (if they exist) for a given tag name.
 * All 404 / "not found" situations are treated as non-fatal.
 *
 * @param {{github_repo: string, github_token: string, tag_name: string}} params
 * @returns {Promise<void>}
 */
async function remove_existing_release_and_tag(params) {
  const { github_repo, github_token, tag_name } = params;
  const headers = build_github_headers(github_token);
  const encoded_tag = encodeURIComponent(tag_name);

  let release_id = null;

  // Detect existing release for tag
  try {
    const release_resp = await github_fetch(
      `https://api.github.com/repos/${github_repo}/releases/tags/${encoded_tag}`,
      { headers, method: 'GET' },
    );
    release_id = release_resp.data?.id;
    if (release_id) {
      console.log(`Found existing release for tag ${tag_name} (id: ${release_id})`);
    }
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) {
      console.log(`No existing release found for tag ${tag_name}`);
    } else {
      log_github_error(err, 'checking existing release by tag');
      throw err;
    }
  }

  // Delete existing release if present
  if (release_id) {
    try {
      await github_fetch(
        `https://api.github.com/repos/${github_repo}/releases/${release_id}`,
        { headers, method: 'DELETE' },
      );
      console.log(`Deleted existing release id ${release_id} for tag ${tag_name}`);
    } catch (err) {
      log_github_error(err, 'deleting existing release');
      throw err;
    }
  }

  // Check if the git tag ref exists
  let tag_exists = false;
  try {
    await github_fetch(
      `https://api.github.com/repos/${github_repo}/git/refs/tags/${encoded_tag}`,
      { headers, method: 'GET' },
    );
    tag_exists = true;
    console.log(`Found git tag ref for ${tag_name}`);
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) {
      console.log(`No existing git tag ref found for ${tag_name}`);
    } else {
      log_github_error(err, 'checking git tag ref');
      throw err;
    }
  }

  if (!tag_exists) {
    return;
  }

  // Delete git tag (ignore "does not exist" edge cases)
  try {
    await github_fetch(
      `https://api.github.com/repos/${github_repo}/git/refs/tags/${encoded_tag}`,
      { headers, method: 'DELETE' },
    );
    console.log(`Deleted existing git tag ${tag_name}`);
  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.message || '';

    // GitHub sometimes returns 422 "Reference does not exist" instead of 404.
    if (status === 404 || (status === 422 && /reference does not exist/i.test(msg))) {
      console.log(`Git tag ${tag_name} was already missing (status ${status})`);
      return;
    }

    log_github_error(err, 'deleting git tag');
    throw err;
  }
}

export {
  build_github_headers,
  log_github_error,
  remove_existing_release_and_tag,
};
