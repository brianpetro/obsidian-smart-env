import { getIcon } from "obsidian";
export function build_html(plugin, opts={}) {
  const {plugin_name = plugin.manifest.name} = opts;
  return `<div class="wrapper">
    <div id="footer-callout" data-callout-metadata="" data-callout-fold="" data-callout="info" class="callout" style="mix-blend-mode: unset;">
      <div class="callout-title" style="align-items: center;">
        <div class="callout-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-info">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </div>
        <div class="callout-title-inner"><strong>Become a Supporter</strong></div>
      </div>
      <div class="callout-content">
        <p>Try early &amp; experimental features:
          <ul>
            <li><b>Smart Connections Early Release:</b>
              <ul>
                <li>Inline block connections</li>
                <li>Footer connections view</li>
                <li>Connections re-ranking</li>
              </ul>
            </li>
            <li><b>Smart Context Early Release:</b>
              <ul>
                <li>Named contexts</li>
                <li>External sources: include code from external repositories</li>
                <li>Context codeblocks: embed context in notes ("My most valuable workflow" - 🌴 Brian)</li>
              </ul>
            </li>
            <li><b>Smart Editor:</b>
              <ul>
                <li>Generate &amp; review changes</li>
              </ul>
            </li>
            <li><em>Be the first to know what's coming next!</em></li>
          </ul>
        </p>
        <p>Access the Supporter Community Campfire Chat:
          <ul>
            <li>Supporter-only private discussions</li>
            <li>Share workflows</li>
            <li>Get priority help &amp; support</li>
          </ul>
        </p>
        <p>Guaranteed seat in the Community Lean Coffee meetings.</p>
        <p><i>Your support shapes the future of ${plugin_name}.</i></p>
        <p>
          <strong>Fuel the circle of empowerment.</strong> <a href="https://smartconnections.app/community-supporters?utm_source=obsidian-${plugin_name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}" class="button" target="_external">Become a Supporter</a>
        </p>
      </div>
    </div>
  </div>`;
}

export function render(plugin, opts={}) {
  const html = build_html.call(this, plugin, opts);
  const frag = this.create_doc_fragment(html);
  const callout = frag.querySelector('#footer-callout');
  const icon_container = callout.querySelector('.callout-icon');
  const icon = getIcon('hand-heart');
  if (icon) {
    this.empty(icon_container);
    icon_container.appendChild(icon);
  }
  post_process.call(this, plugin, callout, opts);
  return callout;
}

function post_process(plugin, callout) {
}