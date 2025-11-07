import { getIcon } from "obsidian";
export function build_html(env, opts={}) {
  return `<div class="wrapper">
    <div id="lean-coffee-callout" data-callout-metadata="" data-callout-fold="" data-callout="info" class="callout" style="mix-blend-mode: unset;">
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
        <div class="callout-title-inner">
          <strong>Community Lean Coffee</strong>
        </div>
      </div>
      <div class="callout-content">
        <p dir="auto">
          <span>Ask questions. Bring challenges. Request features. Show workflows. Be ready to share.</span>
          <br>
          <i>Join the next <a href="https://lu.ma/calendar/cal-ZJtdnzAdURyouM7" target="_external">Community Lean Coffee</a> meeting.</i> Unable to attend? Submit a question <a href="https://docs.google.com/forms/d/e/1FAIpQLSdqOtTjksMwg1BOuGNCncpMQ_QT-wcd-3AgZGIe3A_isut5aQ/viewform?usp=dialog" target="_external">here</a> 🌴
        </p>
      </div>
    </div>
  </div>`;
}

export function render(env, opts={}) {
  const html = build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  const callout = frag.querySelector('#lean-coffee-callout');
  const icon_container = callout.querySelector('.callout-icon');
  const icon = getIcon('smart-chat');
  if (icon) {
    this.empty(icon_container);
    icon_container.appendChild(icon);
  }
  post_process.call(this, env, callout, opts);
  return callout;
}

function post_process(env, callout) {
}