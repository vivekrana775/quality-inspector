export type View = 'inspections' | 'new' | 'summary';
export const getView = (): View =>
  ['new', 'summary'].includes(window.location.hash.slice(1))
    ? (window.location.hash.slice(1) as View)
    : 'inspections';
export const navigate = (view: View) => {
  window.location.hash = view;
};
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
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
