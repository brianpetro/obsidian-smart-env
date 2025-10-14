
export async function render(scope, params={}) {
  const frag = this.create_doc_fragment(`
      <div class="sc-brand">
        <svg viewBox="0 0 100 100" class="svg-icon smart-connections">
          <path d="M50,20 L80,40 L80,60 L50,100" stroke="currentColor" stroke-width="4" fill="none"></path>
          <path d="M30,50 L55,70" stroke="currentColor" stroke-width="5" fill="none"></path>
          <circle cx="50" cy="20" r="9" fill="currentColor"></circle>
          <circle cx="80" cy="40" r="9" fill="currentColor"></circle>
          <circle cx="80" cy="70" r="9" fill="currentColor"></circle>
          <circle cx="50" cy="100" r="9" fill="currentColor"></circle>
          <circle cx="30" cy="50" r="9" fill="currentColor"></circle>
        </svg>
        <p><a style="font-weight: 700;" href="https://smartconnections.app/">Smart Env</a></p>
      </div>
    `)
  ;
  return frag;
}