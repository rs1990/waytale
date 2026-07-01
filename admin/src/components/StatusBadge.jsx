import React from 'react';

const COLORS = {
  published: { bg: '#064E3B', text: '#6EE7B7', label: 'Published' },
  reviewed:  { bg: '#1E3A5F', text: '#93C5FD', label: 'Reviewed' },
  pending:   { bg: '#451A03', text: '#FCD34D', label: 'Pending' },
  rejected:  { bg: '#450A0A', text: '#FCA5A5', label: 'Rejected' },
  archived:  { bg: '#1E293B', text: '#64748B', label: 'Archived' },
};

export function StatusBadge({ status }) {
  const c = COLORS[status] ?? COLORS.archived;
  return (
    <span style={{
      background: c.bg, color: c.text,
      borderRadius: 6, padding: '2px 8px',
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {c.label}
    </span>
  );
}
