import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from './api.js';
import { StatusBadge } from './components/StatusBadge.jsx';
import { DiffView } from './components/DiffView.jsx';

const TAB = { LANDMARKS: 'landmarks', PENDING: 'pending', LOG: 'log' };

export default function App() {
  const [tab, setTab] = useState(TAB.LANDMARKS);

  return (
    <div style={s.root}>
      <header style={s.header}>
        <span style={s.logo}>WayTale Admin</span>
        <nav style={s.nav}>
          {Object.values(TAB).map(t => (
            <button key={t} style={tab === t ? s.navBtnActive : s.navBtn} onClick={() => setTab(t)}>
              {t === TAB.LANDMARKS ? '🗺 Landmarks' : t === TAB.PENDING ? '⏳ Pending Review' : '📋 Refresh Log'}
            </button>
          ))}
        </nav>
      </header>

      <main style={s.main}>
        {tab === TAB.LANDMARKS && <LandmarksTab />}
        {tab === TAB.PENDING   && <PendingTab />}
        {tab === TAB.LOG       && <LogTab />}
      </main>
    </div>
  );
}

// ─── Landmarks Tab ────────────────────────────────────────────────────────────

function LandmarksTab() {
  const [landmarks, setLandmarks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(null); // landmarkId being refreshed
  const [allRefreshing, setAllRefreshing] = useState(false);
  const [results, setResults] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLandmarks((await adminApi.landmarks()).landmarks); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refreshOne(id, name) {
    setRefreshing(id);
    try {
      const r = await adminApi.refreshOne(id);
      alert(`${name}: ${r.changed ? '✓ New content pending review' : 'No changes detected'}`);
      await load();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setRefreshing(null);
    }
  }

  async function refreshAll() {
    if (!confirm('Pull updates for ALL landmarks from Wikipedia + Google Places?')) return;
    setAllRefreshing(true);
    try {
      const r = await adminApi.refreshAll();
      setResults(r);
      await load();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setAllRefreshing(false);
    }
  }

  return (
    <section>
      <div style={s.rowBetween}>
        <h2 style={s.h2}>Landmarks</h2>
        <button style={s.btnPrimary} onClick={refreshAll} disabled={allRefreshing}>
          {allRefreshing ? '⏳ Refreshing all...' : '🔄 Pull All Updates'}
        </button>
      </div>

      {results && (
        <div style={s.resultBox}>
          <strong>Refresh complete:</strong>{' '}
          {results.changed?.length} updated · {results.unchanged?.length} unchanged · {results.failed?.length} failed
          {results.changed?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#86EFAC' }}>
              Updated: {results.changed.join(', ')}
            </div>
          )}
        </div>
      )}

      {loading ? <Spinner /> : (
        <table style={s.table}>
          <thead>
            <tr>
              {['Landmark', 'Published', 'Pending', 'Tips', 'Last Refresh', 'Action'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {landmarks.map(lm => (
              <tr key={lm.id} style={s.tr}>
                <td style={s.td}>
                  <div style={{ fontWeight: 600, color: '#F1F5F9' }}>{lm.name}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{lm.wikidata_id}</div>
                </td>
                <td style={s.tdCenter}>{lm.published_count > 0 ? <StatusBadge status="published" /> : '—'}</td>
                <td style={s.tdCenter}>
                  {lm.pending_count > 0
                    ? <span style={{ color: '#FCD34D', fontWeight: 700 }}>{lm.pending_count} pending</span>
                    : '—'}
                </td>
                <td style={s.tdCenter}>{lm.review_tips_count || '—'}</td>
                <td style={s.tdCenter}>
                  {lm.last_refresh
                    ? new Date(lm.last_refresh).toLocaleDateString()
                    : <span style={{ color: '#64748B' }}>Never</span>}
                </td>
                <td style={s.tdCenter}>
                  <button
                    style={s.btnSmall}
                    onClick={() => refreshOne(lm.id, lm.name)}
                    disabled={refreshing === lm.id}
                  >
                    {refreshing === lm.id ? '⏳' : '🔄 Refresh'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── Pending Review Tab ───────────────────────────────────────────────────────

function PendingTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await adminApi.pending()).pending); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id, action) {
    setActing(id);
    try {
      if (action === 'approve') await adminApi.approve(id);
      else if (action === 'publish') await adminApi.publish(id);
      else await adminApi.reject(id);
      await load();
      if (expanded === id) setExpanded(null);
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setActing(null);
    }
  }

  if (loading) return <Spinner />;

  if (!items.length) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 40 }}>✓</div>
        <div>No pending content — all up to date</div>
      </div>
    );
  }

  return (
    <section>
      <div style={s.rowBetween}>
        <h2 style={s.h2}>Pending Review <span style={s.count}>{items.length}</span></h2>
      </div>

      {items.map(item => (
        <div key={item.id} style={s.card}>
          <div style={s.cardHeader} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
            <div>
              <span style={{ fontWeight: 700, color: '#F1F5F9' }}>{item.landmark_name}</span>
              <span style={s.contentTag}>
                {item.content_type === 'ambient' ? 'Ambient' : `Deep Dive · ${item.variant}`}
              </span>
              <StatusBadge status={item.fact_type === 'verified' ? 'published' : 'pending'} />
              {item.fact_type !== 'verified' && (
                <span style={s.legendTag}>⚠ Contains legend</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#64748B', fontSize: 12 }}>v{item.version}</span>
              <span>{expanded === item.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {expanded === item.id && (
            <div style={s.cardBody}>
              {/* Diff vs. previous published version */}
              <div style={s.diffSection}>
                <div style={s.diffLabel}>
                  {item.published_script ? 'Changes vs. current live version:' : 'New content (no previous version):'}
                </div>
                <DiffView oldText={item.published_script} newText={item.script} />
              </div>

              {/* Sources */}
              <div style={s.sourcesBox}>
                <div style={s.diffLabel}>Sources:</div>
                {JSON.parse(item.sources ?? '[]').map((s_, i) => (
                  <a key={i} href={s_.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
                    [{i+1}] {s_.source}: {s_.url}
                  </a>
                ))}
              </div>

              {/* Action buttons */}
              <div style={s.actions}>
                <button
                  style={s.btnApprove}
                  onClick={() => act(item.id, 'approve')}
                  disabled={acting === item.id}
                >
                  ✓ Approve (review pass)
                </button>
                <button
                  style={s.btnPublish}
                  onClick={() => act(item.id, 'publish')}
                  disabled={acting === item.id}
                >
                  🚀 Approve & Publish live
                </button>
                <button
                  style={s.btnReject}
                  onClick={() => act(item.id, 'reject')}
                  disabled={acting === item.id}
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

// ─── Refresh Log Tab ──────────────────────────────────────────────────────────

function LogTab() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.refreshLog(50)
      .then(r => setLog(r.log))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <section>
      <h2 style={s.h2}>Refresh History</h2>
      <table style={s.table}>
        <thead>
          <tr>
            {['Landmark', 'Triggered', 'Wiki Changed', 'Reviews', 'Regenerated', 'Status'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.map(entry => (
            <tr key={entry.id} style={s.tr}>
              <td style={s.td}>{entry.landmark_name}</td>
              <td style={s.tdCenter}>{new Date(entry.triggered_at).toLocaleString()}</td>
              <td style={s.tdCenter}>{entry.wiki_changed ? '✓' : '—'}</td>
              <td style={s.tdCenter}>{entry.reviews_added || '—'}</td>
              <td style={s.tdCenter}>{entry.scripts_regen ? '✓' : '—'}</td>
              <td style={s.tdCenter}><StatusBadge status={entry.status === 'completed' ? 'published' : entry.status === 'failed' ? 'rejected' : 'pending'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>Loading...</div>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root:   { minHeight: '100vh' },
  header: {
    background: '#1E293B', borderBottom: '1px solid #334155',
    padding: '0 24px', display: 'flex', alignItems: 'center',
    height: 56, gap: 32, position: 'sticky', top: 0, zIndex: 10,
  },
  logo: { fontWeight: 800, fontSize: 18, color: '#F1F5F9', letterSpacing: 0.5 },
  nav:  { display: 'flex', gap: 4 },
  navBtn: {
    background: 'transparent', border: 'none', color: '#94A3B8',
    padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  },
  navBtnActive: {
    background: '#0F172A', border: 'none', color: '#F1F5F9',
    padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
  },
  main: { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  h2:   { fontSize: 20, fontWeight: 700, color: '#F1F5F9', marginBottom: 16 },
  count:{ background: '#2563EB', color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 13, marginLeft: 8 },

  rowBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  btnPrimary: {
    background: '#2563EB', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 14,
  },
  btnSmall: {
    background: '#1E3A5F', color: '#93C5FD', border: 'none',
    borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
  },
  btnApprove: {
    background: '#052E16', color: '#86EFAC', border: '1px solid #166534',
    borderRadius: 8, padding: '8px 16px', fontWeight: 700,
  },
  btnPublish: {
    background: '#2563EB', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 16px', fontWeight: 700,
  },
  btnReject: {
    background: '#450A0A', color: '#FCA5A5', border: '1px solid #7F1D1D',
    borderRadius: 8, padding: '8px 16px', fontWeight: 700,
  },

  table: { width: '100%', borderCollapse: 'collapse' },
  th:    { textAlign: 'left', padding: '10px 12px', color: '#64748B', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #1E293B' },
  tr:    { borderBottom: '1px solid #1E293B' },
  td:    { padding: '12px 12px', fontSize: 14 },
  tdCenter: { padding: '12px 12px', fontSize: 14, textAlign: 'center' },

  card:       { background: '#1E293B', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  cardHeader: {
    padding: '14px 18px', cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    userSelect: 'none',
  },
  cardBody:   { padding: '0 18px 18px', borderTop: '1px solid #334155' },
  contentTag: {
    background: '#0F172A', color: '#94A3B8',
    borderRadius: 6, padding: '2px 8px', fontSize: 11, margin: '0 8px',
  },
  legendTag: {
    background: '#451A03', color: '#FCD34D',
    borderRadius: 6, padding: '2px 8px', fontSize: 11, marginLeft: 6,
  },
  diffSection:{ marginTop: 16, background: '#0F172A', borderRadius: 8, padding: 14 },
  diffLabel:  { fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sourcesBox: { marginTop: 12, padding: '10px 14px', background: '#0F172A', borderRadius: 8 },
  actions:    { marginTop: 14, display: 'flex', gap: 10 },

  resultBox: {
    background: '#052E16', border: '1px solid #166534', borderRadius: 8,
    padding: '12px 16px', marginBottom: 16, color: '#86EFAC', fontSize: 14,
  },
  emptyState: {
    textAlign: 'center', padding: 60, color: '#64748B', fontSize: 16,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
};
