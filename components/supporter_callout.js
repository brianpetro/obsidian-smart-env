import { open_url_externally } from "../utils/open_url_externally.js";
export function build_html(plugin, opts={}) {
  const {plugin_name = plugin.manifest.name} = opts;
  return `<div class="wrapper">
    <div id="footer-callout" data-callout-metadata="" data-callout-fold="" data-callout="info" class="callout" style="mix-blend-mode: unset;">
      <div class="callout-title">
        <div class="callout-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-info">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </div>
        <div class="callout-title-inner">
          <p><strong>Fuel the circle of empowerment</strong></p>
          <p>Your support shapes the future ${plugin_name}.</p>
          <a href="https://smartconnections.app/community-supporters?utm_source=obsidian-${plugin_name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}" class="button">Become a Supporter</a>
        </div>
      </div>
    </div>
  </div>`;
}

export function render(plugin, opts={}) {
  const html = build_html.call(this, plugin, opts);
  const frag = this.create_doc_fragment(html);
  const callout = frag.querySelector('#footer-callout');
  post_process.call(this, plugin, callout, opts);
  return callout;
}

function post_process(plugin, callout) {
  const button = callout.querySelector('a');
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    open_url_externally(plugin, button.href);
  });
}