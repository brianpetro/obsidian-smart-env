function build_html() {
  return `<div>
    <button class="copy-all-notifications-btn">Copy All Notifications</button>
    <div class="smart-env-notifications-feed"></div>
  </div>`;
}
export async function render(env, params = {}) {
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return frag;
}


async function post_process(env, container, params = {}) {
  const feed_container = container.querySelector('.smart-env-notifications-feed');
  this.empty(feed_container);
  const entries = Array.isArray(env.event_logs.session_events) ? [...env.event_logs.session_events] : [];
  if (!entries.length) {
    const empty = feed_container.ownerDocument.createElement('p');
    empty.className = 'smart-env-notifications-empty';
    empty.textContent = 'No Smart Env notifications yet.';
    feed_container.appendChild(empty);
    return;
  }
  entries.slice(-100).reverse().forEach((entry) => {
    append_entry(feed_container, entry);
  });
  // add copy all button
  const copy_btn = container.querySelector('.copy-all-notifications-btn');
  copy_btn.addEventListener('click', () => {
    const all_text = feed_container.textContent;
    navigator.clipboard.writeText(all_text).then(() => {
      copy_btn.textContent = 'Copied!';
      setTimeout(() => {
        copy_btn.textContent = 'Copy All Notifications';
      }, 2000);
    });
  });
}

function append_entry(feed_container, entry) {
  const row = feed_container.ownerDocument.createElement('div');
  row.className = 'smart-env-notification';
  row.dataset.level = entry.level || 'info';
  feed_container.appendChild(row);
  
  const meta = feed_container.ownerDocument.createElement('div');
  meta.className = 'smart-env-notification__meta';
  const timestamp = typeof entry.event.at === 'number' ? entry.event.at : Date.now();
  meta.textContent = `${entry.event.collection_key ? entry.event.collection_key + ' - ' : ''}${entry.event_key} - ${to_time_ago(timestamp)}\n`; // IMPORTANT NOTE: trailing newline for spacing in copy to clipboard
  row.appendChild(meta);
  
  const event_payload_content = Object.entries(entry.event)
    .filter(([k, v]) => !['at', 'collection_key'].includes(k))
    .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`) // IMPORTANT NOTE: two prefix spaces for indentation
    .join('\n')
  ;
  if (event_payload_content.trim().length) {
    row.style.cursor = 'pointer';
    const message = feed_container.ownerDocument.createElement('pre');
    message.className = 'smart-env-notification__message';
    message.textContent = event_payload_content;
    message.textContent += '\n\n'; // IMPORTANT NOTE: trailing newline for spacing in copy to clipboard
    message.style.display = 'none';
    row.appendChild(message);
    row.addEventListener('click', () => {
      if (message.style.display === 'none') {
        message.style.display = 'block';
      } else {
        message.style.display = 'none';
      }
    });
  }


}

function to_time_ago(ms) {
  const now_ms = Date.now();
  console.log(now_ms, ms);
  const seconds = Math.floor((now_ms - ms) / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}