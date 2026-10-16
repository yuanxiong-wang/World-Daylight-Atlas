import React, { useState } from 'react';
import { Dialog } from './Dialog';

export function ShareViewDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setMessage('Clipboard access is unavailable. Select the link below and copy it manually.');
    }
  };
  return (
    <Dialog title="Share this view" onClose={onClose}>
      <div className="space-y-4 max-w-2xl mx-auto">
        <p className="text-sm text-slate-300">This link saves the location, simulation date and time, map mode, and layer settings. It opens paused, so everyone sees the same moment.</p>
        <label htmlFor="shared-view-url" className="block text-sm font-medium">View link</label>
        <input id="shared-view-url" value={url} readOnly onFocus={event => event.target.select()}
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-sky-200 select-text" />
        <button onClick={copy} className="rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 font-semibold cursor-pointer">Copy link</button>
        <p role="status" aria-live="polite" className="text-sm text-sky-300 min-h-5">{message}</p>
        <p className="text-xs text-slate-400">The link includes the selected coordinates. Share it with people you want to see this location.</p>
      </div>
    </Dialog>
  );
}
