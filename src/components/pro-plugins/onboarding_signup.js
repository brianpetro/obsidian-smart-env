const DEFAULT_ONBOARDING_START_URL = 'https://smartconnections.app/onboarding-start/';

/**
 * @param {object} [params]
 * @param {string} [params.source]
 * @returns {string}
 */
export function build_onboarding_start_url(params = {}) {
  const source = String(params.source || '').trim();
  if (!source) return DEFAULT_ONBOARDING_START_URL;

  const url = new URL(DEFAULT_ONBOARDING_START_URL);
  url.searchParams.set('source', source);
  return url.toString();
}

/**
 * @returns {{name: string, description: string, button_text: string}}
 */
export function get_onboarding_signup_setting_copy() {
  return {
    name: 'Get the 12-part getting started email series',
    description: 'Receive a practical onboarding sequence with focused Smart Plugins workflows.',
    button_text: 'Subscribe',
  };
}
