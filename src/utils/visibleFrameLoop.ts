import { isAppVisible, APP_VISIBILITY_EVENT } from './appVisibility.ts';
/** Suspend GPU work offscreen/in hidden tabs; restart with a fresh frame clock. */
export function createVisibleFrameLoop(element: HTMLElement, draw: (time: number, delta: number) => void,
  enabled: () => boolean = () => true) {
  let frame: number | null = null;
  let intersecting = true;
  let disposed = false;
  let previous = performance.now();
  const visible = () => !disposed && isAppVisible() && intersecting && enabled() && element.getClientRects().length > 0;
  const tick = (time: number) => {
    frame = null;
    if (!visible()) { sync(); return; }
    const delta = Math.min(0.1, Math.max(0, (time - previous) / 1000));
    previous = time;
    draw(time, delta);
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    const active = visible();
    element.dataset.rendering = active ? 'running' : 'paused';
    if (active && frame === null) {
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!active && frame !== null) {
      cancelAnimationFrame(frame); frame = null;
    }
  };
  const observer = new IntersectionObserver(entries => {
    intersecting = entries[0]?.isIntersecting ?? false;
    sync();
  });
  observer.observe(element);
  document.addEventListener('visibilitychange', sync); document.addEventListener(APP_VISIBILITY_EVENT, sync);
  sync();
  return { sync, dispose: () => {
    disposed = true; sync(); observer.disconnect(); document.removeEventListener('visibilitychange', sync); document.removeEventListener(APP_VISIBILITY_EVENT, sync);
  } };
}
