import React, { useMemo } from 'react';

/** The simulation instant in the viewer's device time zone. */
export function LocalClock({ date, className = 'text-[10px] font-mono text-slate-400' }: { date: Date; className?: string }) {
  const formatter = useMemo(() => new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
  }), []);
  return <p data-testid="device-local-time" className={className}
    title={`Device time zone: ${formatter.resolvedOptions().timeZone} · ${date.toLocaleString()}`}>
    Local <time dateTime={date.toISOString()}>{formatter.format(date)}</time>
  </p>;
}
