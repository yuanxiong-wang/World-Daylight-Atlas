import { Capacitor } from '@capacitor/core';
import { setNativeActive } from './appVisibility';

export const isNative = Capacitor.isNativePlatform();
export function isCompactViewport() {
  return document.documentElement.classList.contains('native-app') || window.matchMedia('(max-width: 1023px)').matches;
}
export function shareBaseUrl() { return isNative || import.meta.env.MODE === 'ios' ? 'https://mytest.ccwu.cc/' : window.location.href; }
export async function copyText(text: string) {
  if (isNative) {
    const { Clipboard } = await import('@capacitor/clipboard');
    await Clipboard.write({ string: text });
  } else await navigator.clipboard.writeText(text);
}
export async function shareView(url: string) {
  const { Share } = await import('@capacitor/share');
  await Share.share({ title: 'World Daylight Atlas', url, dialogTitle: 'Share this view' });
}
export async function initializeNative() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('appStateChange', ({ isActive }) => setNativeActive(isActive));
  const state = await App.getState();
  setNativeActive(state.isActive);
}
