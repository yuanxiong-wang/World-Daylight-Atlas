// Shared by rendering and playback. Native backgrounding need not hide the DOM.
let nativeActive = true;
export const APP_VISIBILITY_EVENT = 'atlas-visibility';
export function isAppVisible() { return nativeActive && !document.hidden; }
export function setNativeActive(active: boolean) {
  nativeActive = active;
  document.dispatchEvent(new Event(APP_VISIBILITY_EVENT));
}
