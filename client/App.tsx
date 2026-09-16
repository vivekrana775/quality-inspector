import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, CheckCircle2, ClipboardList, Layers3, LogOut, Plus, X } from 'lucide-react';
import type { Session } from '../shared/schema';
import { api, onUnauthorized } from './api';
import { useRoute } from './hooks';
import { discard, replay, useOutbox, type PendingInspection } from './outbox';
import { buildHash, navigate, type View } from './utils';
import { PendingSync } from './components/PendingSync';
import InspectionList from './pages/InspectionList';
import Login from './pages/Login';
import NewInspection from './pages/NewInspection';
import SummaryView from './pages/SummaryView';

const navItems: { view: View; label: string; icon: typeof ClipboardList }[] = [
  { view: 'inspections', label: 'Inspections', icon: ClipboardList },
  { view: 'new', label: 'New inspection', icon: Plus },
  { view: 'summary', label: 'Summary', icon: BarChart3 },
];

const titles: Record<View, string> = {
  inspections: 'Quality inspections',
  new: 'Log an inspection',
  summary: 'Inspection summary',
};

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean>();
  const pending = useOutbox();

  useEffect(() => {
    api<Session>('/auth/session')
      .then((session) => setAuthenticated(session.authenticated))
      .catch(() => setAuthenticated(false));
    return onUnauthorized(() => setAuthenticated(false));
  }, []);

  if (authenticated === undefined) return null;
  if (!authenticated) {
    return <Login onSignedIn={() => setAuthenticated(true)} pendingCount={pending.length} />;
  }
  return (
    <Workspace
      pending={pending}
      onSignOut={() =>
        api('/auth/logout', { method: 'POST' })
          .catch(() => undefined)
          .finally(() => setAuthenticated(false))
      }
    />
  );
}

function Workspace({
  pending,
  onSignOut,
}: {
  pending: PendingInspection[];
  onSignOut: () => void;
}) {
  const { view, params } = useRoute();
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);

  useEffect(() => {
    // Move focus to the new page title on navigation, but not on the initial render.
    if (previousView.current !== view) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    previousView.current = view;
  }, [view]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);

  const sync = useCallback(
    () =>
      replay().then((count) => {
        if (!count) return;
        setRevision((value) => value + 1);
        setNotice(`${count} offline ${count === 1 ? 'inspection' : 'inspections'} synced.`);
      }),
    [],
  );

  // Anything queued while offline goes out once we're signed in and back on the network.
  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [sync]);

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-nav">
        <a className="brand" href="#inspections" aria-label="Quality Inspection Tracker">
          <span className="brand-mark">
            <Layers3 size={22} />
          </span>
          <span className="brand-text">Quality Inspection Tracker</span>
        </a>
        <nav aria-label="Main navigation">
          {navItems.map(({ view: target, label, icon: Icon }) => (
            <a
              key={target}
              href={buildHash(target, params)}
              className={`nav-item ${view === target ? 'active' : ''}`}
              aria-current={view === target ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {target === 'inspections' && pending.length > 0 && (
                <span className="nav-badge" aria-hidden="true">
                  {pending.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="nav-end">
          <button type="button" className="nav-item" onClick={onSignOut}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main id="main-content">
        <div className="page-heading">
          <h1 ref={heading} tabIndex={-1}>
            {titles[view]}
          </h1>
          {view !== 'new' && (
            <button type="button" className="button primary" onClick={() => navigate('new')}>
              <Plus size={18} />
              Log inspection
            </button>
          )}
        </div>
        {view === 'new' && (
          <NewInspection
            onSaved={(record) => {
              setRevision((value) => value + 1);
              setNotice(`Inspection #${record.id} logged.`);
              navigate('inspections', new URLSearchParams());
            }}
            onQueued={() => {
              setNotice('Saved offline. It will sync when the connection is back.');
              navigate('inspections', new URLSearchParams());
            }}
          />
        )}
        {view === 'inspections' && (
          <>
            {pending.length > 0 && (
              <PendingSync items={pending} onSync={sync} onDiscard={discard} />
            )}
            <InspectionList
              revision={revision}
              onResolved={() => setRevision((value) => value + 1)}
            />
          </>
        )}
        {view === 'summary' && <SummaryView />}
      </main>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
