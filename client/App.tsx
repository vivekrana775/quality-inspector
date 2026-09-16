import { useEffect, useRef, useState } from 'react';
import {
  Layers3,
  Factory,
  ClipboardList,
  Plus,
  BarChart3,
  ChevronRight,
  CalendarDays,
  ShieldCheck,
  CheckCircle2,
  X,
} from 'lucide-react';
import type { Summary } from '../shared/schema';
import { useApi } from './api';
import { dateLabel, getView, localToday, navigate, type View } from './utils';
import { ErrorState, MetricCards } from './components/ui';
import InspectionList from './pages/InspectionList';
import NewInspection from './pages/NewInspection';
import SummaryView from './pages/SummaryView';

export default function App() {
  const [view, setView] = useState<View>(getView);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useApi<Summary>('/inspections/summary', revision);
  useEffect(() => {
    const listener = () => setView(getView());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [view]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 6500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const changed = (message: string) => {
    setRevision((value) => value + 1);
    setNotice(message);
  };
  const titles = {
    inspections: 'Quality inspections',
    new: 'Log an inspection',
    summary: 'Inspection summary',
  };
  const descriptions = {
    inspections: 'Every defect accounted for. Every resolution in one place.',
    new: 'Capture a quality issue while it’s fresh on the shop floor.',
    summary: 'A clear view of quality across all inspections.',
  };
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
      <aside className="sidebar">
        <a className="brand" href="#inspections">
          <span className="brand-mark">
            <Layers3 size={24} />
          </span>
          <span>
            QUALITY<span className="brand-subtitle">INSPECTION TRACKER</span>
          </span>
        </a>
        <p className="nav-eyebrow">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {[
            { view: 'inspections', label: 'Inspections', icon: ClipboardList },
            { view: 'new', label: 'New inspection', icon: Plus },
            { view: 'summary', label: 'Summary', icon: BarChart3 },
          ].map(({ view: target, label, icon: Icon }) => (
            <a
              key={target}
              href={`#${target}`}
              className={`nav-item ${view === target ? 'active' : ''}`}
              aria-current={view === target ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {view === target && <ChevronRight className="nav-chevron" size={16} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Factory size={22} />
          <div>
            Shop-floor workspace<span>Quality operations</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Operations <ChevronRight size={14} />
            <span>Quality control</span>
          </div>
          <div className="topbar-date">
            <CalendarDays size={15} />
            {dateLabel(localToday())}
          </div>
          <span className="topbar-mark">
            <ShieldCheck size={19} />
          </span>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SHOP-FLOOR QUALITY</p>
              <h1 ref={heading} tabIndex={-1}>
                {titles[view]}
              </h1>
              <p className="page-description">{descriptions[view]}</p>
            </div>
            {view !== 'new' && (
              <button className="button primary add-button" onClick={() => navigate('new')}>
                <Plus size={18} />
                Log inspection
              </button>
            )}
          </div>
          {view === 'new' ? (
            <NewInspection
              onSaved={(record) => {
                changed(`Inspection #${record.id} logged successfully.`);
                navigate('inspections');
              }}
            />
          ) : (
            <>
              {summary.error && <ErrorState message={summary.error} retry={summary.reload} />}
              <MetricCards
                summary={summary.error ? undefined : summary.data}
                loading={summary.loading}
              />
              {view === 'inspections' ? (
                <InspectionList
                  revision={revision}
                  onResolved={() =>
                    changed('Inspection resolved. The resolution note has been saved.')
                  }
                />
              ) : (
                <SummaryView
                  summary={summary.data}
                  loading={summary.loading}
                  error={summary.error}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <ShieldCheck size={14} />
            <span>Better quality starts with a recorded observation.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
