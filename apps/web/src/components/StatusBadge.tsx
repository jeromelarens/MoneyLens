import React from 'react';

export type StatusType = 'success' | 'warning' | 'error' | 'loading' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  sublabel?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, sublabel }) => {
  const statusStyles: Record<StatusType, { bg: string; text: string; dot: string }> = {
    success: {
      bg: 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
      text: 'text-emerald-400',
    },
    warning: {
      bg: 'bg-amber-950/60 border-amber-500/30 text-amber-400',
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
      text: 'text-amber-400',
    },
    error: {
      bg: 'bg-rose-950/60 border-rose-500/30 text-rose-400',
      dot: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]',
      text: 'text-rose-400',
    },
    loading: {
      bg: 'bg-blue-950/60 border-blue-500/30 text-blue-400',
      dot: 'bg-blue-400 animate-pulse',
      text: 'text-blue-400',
    },
    neutral: {
      bg: 'bg-slate-900 border-slate-700/50 text-slate-400',
      dot: 'bg-slate-500',
      text: 'text-slate-400',
    },
  };

  const style = statusStyles[status];

  return (
    <div
      className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border text-xs font-medium ${style.bg}`}
    >
      <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
      <span className="font-semibold">{label}</span>
      {sublabel && (
        <span className="text-slate-400 border-l border-slate-700/60 pl-2">{sublabel}</span>
      )}
    </div>
  );
};
