import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { severities, statuses, type Inspection, type InspectionFilters } from '../../shared/schema';
import { useApi } from '../api';
import { dateLabel, navigate } from '../utils';
import { Badge, Field, ErrorState, Loading } from '../components/ui';
import InspectionDetail from '../components/InspectionDetail';

export default function InspectionList({
  revision,
  onResolved,
}: {
  revision: number;
  onResolved: () => void;
}) {
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<InspectionFilters['sortBy']>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<number | null>(null);
  const invalidRange = !!dateFrom && !!dateTo && dateFrom > dateTo;
  const params = new URLSearchParams({ sortBy, sortOrder });
  for (const [key, value] of Object.entries({ severity, status, dateFrom, dateTo }))
    if (value) params.set(key, value);
  // Do not send an invalid date range; keep the last valid list hidden until corrected.
  const [query, setQuery] = useState(params.toString());
  const serialized = params.toString();
  useEffect(() => {
    if (!invalidRange) setQuery(serialized);
  }, [serialized, invalidRange]);
  const {
    data: records,
    loading,
    error,
    reload,
  } = useApi<Inspection[]>(`/inspections?${query}`, revision);
  const filtered = severity || status || dateFrom || dateTo;
  const clear = () => {
    setSeverity('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
  };
  const sort = (field: InspectionFilters['sortBy']) => {
    setSortBy(field);
    setSortOrder(sortBy === field && sortOrder === 'desc' ? 'asc' : 'desc');
  };
  const sortLabel =
    sortBy === 'severity'
      ? sortOrder === 'desc'
        ? 'Critical first'
        : 'Minor first'
      : sortBy === 'date'
        ? sortOrder === 'desc'
          ? 'Newest first'
          : 'Oldest first'
        : sortBy === 'status'
          ? sortOrder === 'asc'
            ? 'Open first'
            : 'Resolved first'
          : sortOrder === 'asc'
            ? 'A to Z'
            : 'Z to A';
  return (
    <section className="panel inspection-panel" aria-label="Inspection records">
      <div className="panel-heading">
        <div className="panel-title">
          <h2>Inspection register</h2>
          <span className="count-pill">
            {loading || invalidRange || error ? '—' : (records?.length ?? 0)}
          </span>
        </div>
        <button className="icon-button" aria-label="Refresh inspections" onClick={reload}>
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="filters">
        <div className="filters-heading">
          <span>
            <Filter size={15} />
            Filter inspections
          </span>
          {filtered && (
            <button className="text-button" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
        <div className="filter-fields">
          <Field label="Severity" id="filter-severity">
            <select
              id="filter-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All severities</option>
              {severities.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Status" id="filter-status">
            <select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="From date" id="date-from">
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </Field>
          <Field
            label="To date"
            id="date-to"
            error={invalidRange ? 'End date must be on or after start date.' : undefined}
          >
            <input
              id="date-to"
              type="date"
              value={dateTo}
              aria-invalid={invalidRange}
              aria-describedby={invalidRange ? 'date-to-error' : undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="list-toolbar">
        <span className="list-caption">
          {filtered ? 'Filtered inspections' : 'All inspections'}
        </span>
        <div className="sort-controls">
          <label htmlFor="sort-by">Sort by</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as InspectionFilters['sortBy'])}
          >
            <option value="date">Date</option>
            <option value="severity">Severity</option>
            <option value="machineId">Machine</option>
            <option value="status">Status</option>
          </select>
          <button
            className="sort-direction"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            aria-label={`Sort order: ${sortLabel}. Click to reverse.`}
            title={sortLabel}
          >
            {sortOrder === 'desc' ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
            <span>{sortLabel}</span>
          </button>
        </div>
      </div>
      {invalidRange ? (
        <div className="empty-state">
          <CalendarDays size={32} />
          <h3>Check your date range</h3>
          <p>The end date must be on or after the start date.</p>
        </div>
      ) : loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : !records?.length ? (
        <div className="empty-state">
          <ClipboardCheck size={38} />
          <h3>{filtered ? 'No matching inspections' : 'Your first inspection starts here'}</h3>
          <p>
            {filtered
              ? 'Try a wider date range or clear your filters.'
              : 'Log an observation to start tracking quality on your floor.'}
          </p>
          <button className="button secondary" onClick={filtered ? clear : () => navigate('new')}>
            {filtered ? 'Clear filters' : 'Log your first inspection'}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="desktop-records">
            <table>
              <thead>
                <tr>
                  {[
                    ['date', 'Inspection date'],
                    ['machineId', 'Machine / line'],
                    ['', 'Defect type'],
                    ['severity', 'Severity'],
                    ['status', 'Status'],
                    ['', ''],
                  ].map(([field, label], index) => (
                    <th
                      key={index}
                      aria-sort={
                        field && sortBy === field
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {field ? (
                        <button onClick={() => sort(field as InspectionFilters['sortBy'])}>
                          {label}
                          {sortBy === field &&
                            (sortOrder === 'desc' ? (
                              <ArrowDown size={13} />
                            ) : (
                              <ArrowUp size={13} />
                            ))}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="table-date">{dateLabel(record.date)}</span>
                      <span className="record-id">#{String(record.id).padStart(4, '0')}</span>
                    </td>
                    <td>
                      <button className="machine-link" onClick={() => setSelected(record.id)}>
                        {record.machineId}
                      </button>
                      {record.source === 'SAP' && <span className="source-tag">SAP</span>}
                    </td>
                    <td>{record.defectType}</td>
                    <td>
                      <Badge value={record.severity} />
                    </td>
                    <td>
                      <Badge value={record.status} />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`View inspection ${record.id}`}
                        onClick={() => setSelected(record.id)}
                      >
                        <ChevronRight size={19} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-records">
            {records.map((record) => (
              <button
                className="inspection-card"
                key={record.id}
                onClick={() => setSelected(record.id)}
                aria-label={`View ${record.machineId}, ${record.defectType}, ${record.severity}, ${record.status}`}
              >
                <div className="card-top">
                  <span className="card-machine">{record.machineId}</span>
                  <Badge value={record.severity} />
                </div>
                <span className="card-defect">{record.defectType}</span>
                <span className="card-date">
                  <CalendarDays size={14} />
                  {dateLabel(record.date)}
                  <span className="card-id">
                    #{String(record.id).padStart(4, '0')}
                    {record.source === 'SAP' ? ' · SAP' : ''}
                  </span>
                </span>
                <div className="card-bottom">
                  <Badge value={record.status} />
                  <span className="card-action">
                    View details
                    <ArrowRight size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="register-footer">
            Showing {records.length} {records.length === 1 ? 'inspection' : 'inspections'}
            <span>Sorted by {sortBy === 'machineId' ? 'machine' : sortBy}</span>
          </div>
        </>
      )}
      {selected !== null && (
        <InspectionDetail id={selected} onClose={() => setSelected(null)} onResolved={onResolved} />
      )}
    </section>
  );
}
