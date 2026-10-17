import React from 'react';
import { Dialog } from './Dialog';
import type { GlobeInteractionOptions } from '../utils/globeInteraction';

export function NavigationDeck({ options, onChange, reducedMotion, locked, cityName, onToggleLock, onClose }: {
  options: GlobeInteractionOptions; onChange: (options: GlobeInteractionOptions) => void;
  reducedMotion: boolean; locked: boolean; cityName?: string; onToggleLock: () => void; onClose: () => void;
}) {
  return <Dialog title="Navigation & motion" onClose={onClose}>
    <div className="space-y-5 max-w-2xl mx-auto text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
        {['Space|Play / pause solar time', '← / →|Step UTC time by 15 minutes', '[ / ]|Step one calendar month, preserving time', 'L|Lock / unlock the current city', '/|Search any city'].map(row => {
          const [key, text] = row.split('|'); return <React.Fragment key={key}><dt className="font-mono text-sky-300">{key}</dt><dd className="text-slate-300">{text}</dd></React.Fragment>;
        })}
      </dl>
      <p className="text-xs text-slate-400">Shortcuts pause while typing or using dialogs and native controls. City lock protects the selection and pauses automatic camera movement.</p>
      <button disabled={!cityName} onClick={onToggleLock} aria-pressed={locked}
        className="min-h-11 rounded-xl bg-slate-800 px-4 disabled:opacity-40 cursor-pointer">{locked ? 'Unlock' : 'Lock'} {cityName ?? 'a city first'}</button>
      <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Globe behavior</legend>
        {([['spiral', 'Unfold overlapping city dots', 'Dense visible clusters expand into a Fibonacci spiral, with lines to their true locations.'],
          ['snapping', 'Magnetic reticle snapping', 'After a drag, align within 2° of a 30° meridian or 3° of a city near a twilight boundary.'],
          ['idleDrift', 'Ambient idle drift', 'After 30 seconds without input, approach the terminator and drift once per real 24 hours. Simulation time is unchanged.']] as const).map(([key, label, description]) => <label key={key} className="flex items-start justify-between gap-4 py-2 cursor-pointer">
          <span><span className="block text-slate-200">{label}</span><span className="block text-xs text-slate-400 mt-1">{description}</span></span>
          <input type="checkbox" checked={reducedMotion && key !== 'spiral' ? false : options[key]} disabled={reducedMotion && key !== 'spiral'} onChange={event => onChange({ ...options, [key]: event.target.checked })} className="w-5 h-5 shrink-0 accent-sky-400" />
        </label>)}
      </fieldset>
      {reducedMotion && <p className="text-xs text-amber-300">Reduced motion disables magnetic camera animations and idle drift. Spiral placement remains immediate.</p>}
    </div>
  </Dialog>;
}
