let locks = 0;
let originalOverflow = '';

/** Nested modal cleanup may run in either order. Restore scrolling after the last modal closes. */
export function lockBodyScroll() {
  if (locks === 0) originalOverflow = document.body.style.overflow;
  locks += 1;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = originalOverflow;
  };
}
