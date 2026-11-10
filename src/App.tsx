import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { HashRouter, NavLink, Route, Routes, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  House,
  History,
  ChartNoAxesCombined,
  Moon,
  Settings2,
  Leaf,
  ChevronDown,
  WifiOff,
  Check,
  Plus,
  X,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { db, clockWarning } from './lib/db';
import { Context } from './lib/context';
import { useUI } from './lib/store';
import type { BabyEvent, Category } from './lib/model';
import { ageLabel } from './lib/analytics';
import { Welcome } from './components/ChildForm';
import EventEditor from './components/EventEditor';
import EventDetails from './components/EventDetails';
import Home from './pages/Home';
const HistoryPage = lazy(() => import('./pages/History'));
const Reports = lazy(() => import('./pages/Reports'));
const Planner = lazy(() => import('./pages/Planner'));
const Settings = lazy(() => import('./pages/Settings'));
const nav = [
  { to: '/', label: 'Home', icon: House },
  { to: '/history', label: 'History', icon: History },
  { to: '/reports', label: 'Reports', icon: ChartNoAxesCombined },
  { to: '/planner', label: 'Sleep planner', icon: Moon },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];
export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Application />
      </HashRouter>
    </ErrorBoundary>
  );
}
function Application() {
  const children = useLiveQuery(() => db.children.toArray(), []);
  const allSessions = useLiveQuery(() => db.sessions.toArray(), []);
  const settingRows = useLiveQuery(() => db.settings.toArray(), []);
  const { childId, setChild, setTab } = useUI();
  const child = children?.find((c) => c.id === childId) ?? children?.[0];
  const events = useLiveQuery<BabyEvent[]>(
    () => (child ? db.events.where('childId').equals(child.id).toArray() : Promise.resolve([])),
    [child?.id],
  );
  const settings = useMemo(
    () => Object.fromEntries((settingRows ?? []).map((s) => [s.key, s.value])),
    [settingRows],
  );
  const sessions = useMemo(
    () => (allSessions ?? []).filter((s) => s.childId === child?.id),
    [allSessions, child?.id],
  );
  const [editor, setEditor] = useState<{ category: Category; event?: BabyEvent }>();
  const [detail, setDetail] = useState<BabyEvent>();
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void> } | null>(null);
  const notify = (text: string, undo?: () => Promise<void>) => setToast({ text, undo });
  const [online, setOnline] = useState(navigator.onLine);
  const [clockAlert, setClockAlert] = useState('');
  const landingLoaded = useRef(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (child && childId !== child.id) setChild(child.id);
  }, [child, childId, setChild]);
  useEffect(() => {
    if (settingRows && !landingLoaded.current) {
      if (settings.landingTab) setTab(String(settings.landingTab));
      landingLoaded.current = true;
    }
  }, [settingRows, settings, setTab]);
  useEffect(() => {
    const preferred = String(settings.theme ?? 'system');
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        preferred === 'system' ? (query.matches ? 'dark' : 'light') : preferred);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [settings.theme]);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', up);
    let previous = { wall: Date.now(), mono: performance.now() };
    const last = Number(localStorage.getItem('papyrus-last-wall'));
    if (last && Date.now() < last - 120000)
      setClockAlert(
        'The device clock moved backward since your last visit. Review active timer timestamps before saving.',
      );
    const check = () => {
      const current = { wall: Date.now(), mono: performance.now() };
      if (clockWarning(previous, current.wall, current.mono))
        setClockAlert(
          'A device clock change was detected. Review active timer timestamps before saving.',
        );
      previous = current;
      localStorage.setItem('papyrus-last-wall', String(current.wall));
    };
    const id = setInterval(check, 30000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', up);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 10000 : 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const notified = new Set<string>();
    const tick = async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const due = await db.reminders.filter((r) => r.enabled && r.nextAt <= Date.now()).toArray();
      for (const r of due) {
        const key = `${r.id}-${r.nextAt}`;
        if (!notified.has(key)) {
          try {
            new Notification('Papyrus · A little reminder', { body: r.name, tag: key });
            notified.add(key);
          } catch {
            /* in-app dashboard remains available on platforms without constructor support */
          }
        }
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 60000);
    return () => clearInterval(id);
  }, []);
  if (!children || !allSessions || !settingRows || !events)
    return (
      <div className="loading-screen">
        <Leaf size={36} />
        <h2>Opening your little world…</h2>
        <p>Restoring safely saved sessions.</p>
      </div>
    );
  if (!child) return <Welcome />;
  const log = (category: Category) => setEditor({ category });
  const open = (event: BabyEvent) => setDetail(event);
  const otherSessions = allSessions.filter((s) => s.childId !== child.id);
  return (
    <Context.Provider value={{ child, children, events, sessions, settings, log, open, notify }}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Leaf size={23} strokeWidth={1.5} />
            </span>
            papyrus<span className="brand-star">✳</span>
          </Link>
          <p className="brand-tagline">LITTLE MOMENTS, BEAUTIFULLY KEPT.</p>
          <div className="sidebar-child">
            <div className="child-avatar">
              {child.photo ? <img src={child.photo} alt="" /> : child.name[0]}
            </div>
            <div>
              <strong>{child.name}’s world</strong>
              <small>{ageLabel(child)}</small>
            </div>
            <ChevronDown size={15} />
            <select
              aria-label="Select child"
              value={child.id}
              onChange={(e) => setChild(e.target.value)}
            >
              {children.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="nav-label">YOUR EVERYDAY</p>
          <nav className="side-nav" aria-label="Main navigation">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink to={to} end={to === '/'} key={to}>
                <Icon size={20} strokeWidth={1.6} />
                {label}
                {to === '/' && sessions.length > 0 && (
                  <span className="nav-count">{sessions.length}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <span>✧</span>
              <h3>Growing, together.</h3>
              <p>
                There’s no perfect rhythm.
                <br />
                Just the one you find together.
              </p>
            </div>
            <span className="local-status">
              <ShieldCheck size={14} /> PRIVATE & ON YOUR DEVICE
            </span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="mobile-brand">
              <Leaf size={19} />
              papyrus
            </div>
            <span className="topbar-date">{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
            <div className="topbar-right">
              <span className={`connection ${!online ? 'offline' : ''}`}>
                {!online ? <WifiOff size={13} /> : <i />}
                {!online
                  ? 'Offline · safely local'
                  : offlineReady
                    ? 'Ready for offline'
                    : 'Saved on this device'}
              </span>
              <Link to="/settings" className="icon-button" aria-label="Open settings">
                <Settings2 size={18} />
              </Link>
              <div className="mini-avatar child-switcher">
                {child.name[0]}
                <select
                  aria-label="Switch child profile"
                  value={child.id}
                  onChange={(e) => setChild(e.target.value)}
                >
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </header>
          <main className="main-content">
            {clockAlert && (
              <div role="alert" className="warning-banner">
                {clockAlert}
                <button
                  className="icon-button"
                  aria-label="Dismiss clock warning"
                  onClick={() => setClockAlert('')}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {otherSessions.length > 0 && (
              <div className="reminder-banner">
                {otherSessions.length} active timer{otherSessions.length > 1 ? 's' : ''} for another
                child.{' '}
                <button className="text-button" onClick={() => setChild(otherSessions[0].childId)}>
                  Switch child to view →
                </button>
              </div>
            )}
            {((!settings.lastBackup && events.length >= 10) ||
              (!!settings.lastBackup &&
                Date.now() - Number(settings.lastBackup) > 14 * 86400000)) && (
              <Link className="backup-banner" to="/settings">
                A little peace of mind: download a fresh backup of your memories.
              </Link>
            )}
            <Suspense fallback={<div className="card">Opening this chapter…</div>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/planner" element={<Planner />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Suspense>
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={21} strokeWidth={1.7} />
              <span>{label === 'Sleep planner' ? 'Planner' : label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="mobile-add" aria-label="Log diaper" onClick={() => log('diaper')}>
          <Plus />
        </button>
        {detail && (
          <EventDetails
            event={detail}
            onClose={() => setDetail(undefined)}
            onEdit={() => {
              setEditor({ category: detail.category, event: detail });
              setDetail(undefined);
            }}
            notify={notify}
          />
        )}{' '}
        {editor && (
          <EventEditor
            key={`${child.id}-${editor.category}-${editor.event?.id ?? 'new'}`}
            childId={child.id}
            category={editor.category}
            event={editor.event}
            onClose={() => setEditor(undefined)}
            onSaved={() => notify('A little moment, safely saved.')}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={18} />
            {toast.text}
            {toast.undo && (
              <button
                className="undo-button"
                onClick={async () => {
                  try {
                    await toast.undo?.();
                    setToast(null);
                  } catch (e) {
                    notify(String(e));
                  }
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
        {needRefresh && (
          <div className="update-banner">
            <p>A fresh chapter is ready. Your records and active timers stay saved.</p>
            <button className="button" onClick={() => void updateServiceWorker(true)}>
              Update app
            </button>
            <button className="text-button" onClick={() => setNeedRefresh(false)}>
              Later
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main className="welcome">
        <section className="card">
          <h1>Let’s take a breath.</h1>
          <p>Something prevented Papyrus from opening. Your saved records have not been cleared.</p>
          <pre>{this.state.error}</pre>
          <button className="button" onClick={() => location.reload()}>
            Try opening again
          </button>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}
