/**
 * Run a callback on the next animation frame when available.
 * Falls back to a zero-delay timeout in non-DOM test environments.
 *
 * @param {Function} callback
 * @returns {void}
 */
export const schedule_next_frame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

/**
 * Coalesce repeated render requests into a single next-frame render.
 *
 * @param {Function} render_fn
 * @returns {Function}
 */
export const create_render_scheduler = (render_fn) => {
  let render_pending = false;

  return () => {
    if (render_pending) return;
    render_pending = true;

    schedule_next_frame(async () => {
      render_pending = false;
      await render_fn();
    });
  };
};
