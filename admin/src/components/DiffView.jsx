/**
 * Simple word-level diff between old and new script.
 * Green = added, red = removed. No external diff library needed.
 */
import React from 'react';

export function DiffView({ oldText, newText }) {
  if (!oldText) {
    return <div style={styles.new}>{newText}</div>;
  }

  const oldWords = oldText.split(/\s+/);
  const newWords = newText.split(/\s+/);

  // LCS-based diff (simple)
  const parts = computeDiff(oldWords, newWords);

  return (
    <div style={styles.container}>
      {parts.map((p, i) => (
        <span key={i} style={
          p.type === 'add'    ? styles.add :
          p.type === 'remove' ? styles.remove :
          styles.same
        }>
          {p.value + ' '}
        </span>
      ))}
    </div>
  );
}

function computeDiff(oldArr, newArr) {
  // Simplified diff: mark words not in common as add/remove
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);

  const parts = [];
  for (const w of oldArr) {
    if (!newSet.has(w)) parts.push({ type: 'remove', value: w });
  }
  for (const w of newArr) {
    if (!oldSet.has(w)) parts.push({ type: 'add', value: w });
    else parts.push({ type: 'same', value: w });
  }
  return parts;
}

const styles = {
  container: { lineHeight: 1.8, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap' },
  add:    { background: '#052E16', color: '#86EFAC', borderRadius: 2 },
  remove: { background: '#450A0A', color: '#FCA5A5', borderRadius: 2, textDecoration: 'line-through' },
  same:   { color: '#94A3B8' },
  new:    { color: '#CBD5E1', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' },
};
