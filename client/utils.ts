export type View = 'inspections' | 'new' | 'summary';
export interface Route {
  view: View;
  params: URLSearchParams;
}

const views: readonly View[] = ['inspections', 'new', 'summary'];

// Routes look like "#inspections?status=Open". Anything unknown falls back to the list.
export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const view = views.find((candidate) => candidate === path) ?? 'inspections';
  return { view, params: new URLSearchParams(query) };
}

export function buildHash(view: View, params?: URLSearchParams) {
  const query = params?.toString();
  return query ? `#${view}?${query}` : `#${view}`;
}

// Page change. The current list query is carried along unless the caller replaces it.
export function navigate(view: View, params = parseHash(window.location.hash).params) {
  window.location.hash = buildHash(view, params);
}

// Filter or sort change: rewrite the query in place so typing a date doesn't fill up history.
export function replaceParams(params: URLSearchParams) {
  history.replaceState(null, '', buildHash(parseHash(window.location.hash).view, params));
  window.dispatchEvent(new Event('hashchange'));
}

export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    // Noon local time keeps the calendar date stable across DST and UTC offsets.
    new Date(`${date}T12:00:00`),
  );

export const timestampLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(date),
  );

export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context, which a phone on http://192.168.x.x isn't.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
