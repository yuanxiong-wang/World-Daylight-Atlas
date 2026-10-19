import React, { useEffect, useId, useRef } from 'react';

export function Dialog({ title, onClose, children, placement = 'center' }: {
  title: string; onClose: () => void; children: React.ReactNode; placement?: 'center' | 'bottom';
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current!;
    dialog.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return (
    <div className={`atlas-dialog-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center ${placement === 'bottom' ? 'items-end' : 'p-3 sm:p-6 items-center'}`}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`w-full flex flex-col border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl outline-none ${placement === 'bottom' ? 'max-w-2xl max-h-[72dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'max-w-5xl max-h-[92dvh] rounded-2xl'}`}>
        <header className="shrink-0 flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-3">
          <h2 id={titleId} className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg min-h-11 min-w-11 px-3 py-1 hover:bg-slate-700 cursor-pointer">✕</button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
