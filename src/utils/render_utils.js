/**
 * Create a render scheduler that coalesces repeated calls into one frame.
 *
 * UI components in the builder tree and header can receive several
 * `context:updated` events in quick succession. Scheduling rendering on the
 * next frame keeps those updates responsive without doing redundant work.
 *
 * @param {Function} render_fn
 * @returns {Function & { cancel: Function, flush: Function }}
 */
export function create_render_scheduler(render_fn) {
  let handle = null;
  let pending = false;
  let last_args = [];
  let last_result = null;

  const clear_handle = () => {
    if (handle === null) return;
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle);
    } else {
      clearTimeout(handle);
    }
    handle = null;
  };

  const run = async () => {
    pending = false;
    handle = null;
    last_result = await render_fn(...last_args);
    return last_result;
  };

  const schedule = (...args) => {
    last_args = args;
    if (pending) return;

    pending = true;
    if (typeof requestAnimationFrame === 'function') {
      handle = requestAnimationFrame(() => {
        void run();
      });
      return;
    }

    handle = setTimeout(() => {
      void run();
    }, 0);
  };

  schedule.cancel = () => {
    pending = false;
    clear_handle();
  };

  schedule.flush = async (...args) => {
    if (args.length) {
      last_args = args;
    }
    if (!pending) {
      last_result = await render_fn(...last_args);
      return last_result;
    }

    schedule.cancel();
    last_result = await render_fn(...last_args);
    return last_result;
  };

  return schedule;
}

/**
 * Compared the above to below:
 */
// /**
//  * Run a callback on the next animation frame when available.
//  * Falls back to a zero-delay timeout in non-DOM test environments.
//  *
//  * @param {Function} callback
//  * @returns {void}
//  */
// export const schedule_next_frame = (callback) => {
//   if (typeof requestAnimationFrame === 'function') {
//     requestAnimationFrame(callback);
//     return;
//   }
//   setTimeout(callback, 0);
// };

// /**
//  * Coalesce repeated render requests into a single next-frame render.
//  *
//  * @param {Function} render_fn
//  * @returns {Function}
//  */
// export const create_render_scheduler = (render_fn) => {
//   let render_pending = false;

//   return () => {
//     if (render_pending) return;
//     render_pending = true;

//     schedule_next_frame(async () => {
//       render_pending = false;
//       await render_fn();
//     });
//   };
// };

