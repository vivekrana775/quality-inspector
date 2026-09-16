import { useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ClipboardCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  severities,
  sortFields,
  statuses,
  type Inspection,
  type SortField,
} from '../../shared/schema';
import { useApi } from '../api';
import { DESKTOP_QUERY, useMediaQuery, useRoute } from '../hooks';
import {
  activeFilterCount,
  defaultSortOrder,
  readListQuery,
  sortFieldLabels,
  sortLabels,
  toSearchParams,
  type ListQuery,
} from '../listQuery';
import { navigate, replaceParams } from '../utils';
import { ErrorState, Field, Loading } from '../components/ui';
import { InspectionCards } from '../components/InspectionCards';
import { InspectionTable } from '../components/InspectionTable';
import InspectionDetail from '../components/InspectionDetail';

export default function InspectionList({
  revision,
  onResolved,
}: {
  revision: number;
  onResolved: () => void;
}) {
  const { params } = useRoute();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const query = readListQuery(params);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const invalidRange = !!query.dateFrom && !!query.dateTo && query.dateFrom > query.dateTo;
  const {
    data: records,
    loading,
    error,
    reload,
  } = useApi<Inspection[]>(invalidRange ? null : `/inspections?${toSearchParams(query)}`, revision);

  const filterCount = activeFilterCount(query);
  const update = (patch: Partial<ListQuery>) =>
    replaceParams(toSearchParams({ ...query, ...patch }));
  const clearFilters = () => update({ severity: '', status: '', dateFrom: '', dateTo: '' });
  const changeSort = (field: SortField) =>
    update({
      sortBy: field,
      sortOrder:
        field === query.sortBy
          ? query.sortOrder === 'desc'
            ? 'asc'
            : 'desc'
          : defaultSortOrder[field],
    });
  const flipSort = () => update({ sortOrder: query.sortOrder === 'desc' ? 'asc' : 'desc' });
  const sortLabel = sortLabels[query.sortBy][query.sortOrder];

  let body: ReactNode;
  if (invalidRange) {
    body = (
      <div className="empty-state">
        <CalendarDays size={32} />
        <h3>Check your date range</h3>
        <p>The end date must be on or after the start date.</p>
      </div>
    );
  } else if (loading && !records) {
    body = <Loading label="Loading inspections…" />;
  } else if (error) {
    body = <ErrorState message={error} retry={reload} />;
  } else if (!records?.length) {
    body = (
      <div className="empty-state">
        <ClipboardCheck size={36} />
        <h3>{filterCount ? 'No matching inspections' : 'No inspections yet'}</h3>
        <p>
          {filterCount
            ? 'Try a wider date range or clear the filters.'
            : 'Log the first one and it will show up here.'}
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={filterCount ? clearFilters : () => navigate('new')}
        >
          {filterCount ? 'Clear filters' : 'Log an inspection'}
          <ArrowRight size={16} />
        </button>
      </div>
    );
  } else if (isDesktop) {
    body = (
      <InspectionTable
        records={records}
        sortBy={query.sortBy}
        sortOrder={query.sortOrder}
        onSort={changeSort}
        onSelect={setSelected}
      />
    );
  } else {
    body = <InspectionCards records={records} onSelect={setSelected} />;
  }

  return (
    <section className="panel" aria-label="Inspection records">
      <div className="list-toolbar">
        {!isDesktop && (
          <button
            type="button"
            className="filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="filter-panel"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} />
            Filters
            {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
          </button>
        )}
        <div className="sort-controls">
          <label htmlFor="sort-by">Sort by</label>
          <select
            id="sort-by"
            value={query.sortBy}
            onChange={(e) => changeSort(e.target.value as SortField)}
          >
            {sortFields.map((field) => (
              <option key={field} value={field}>
                {sortFieldLabels[field]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sort-direction"
            onClick={flipSort}
            aria-label={`Sort order: ${sortLabel}. Activate to reverse.`}
            title={sortLabel}
          >
            {query.sortOrder === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            {isDesktop && <span>{sortLabel}</span>}
          </button>
        </div>
      </div>
      {(isDesktop || filtersOpen) && (
        <div className="filters" id="filter-panel">
          <div className="filter-fields">
            <Field label="Severity" id="filter-severity">
              <select
                id="filter-severity"
                value={query.severity}
                onChange={(e) => update({ severity: e.target.value as ListQuery['severity'] })}
              >
                <option value="">All severities</option>
                {severities.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" id="filter-status">
              <select
                id="filter-status"
                value={query.status}
                onChange={(e) => update({ status: e.target.value as ListQuery['status'] })}
              >
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
                value={query.dateFrom}
                onChange={(e) => update({ dateFrom: e.target.value })}
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
                value={query.dateTo}
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'date-to-error' : undefined}
                onChange={(e) => update({ dateTo: e.target.value })}
              />
            </Field>
          </div>
          <div className="filters-footer">
            <span role="status">
              {records && !invalidRange
                ? `${records.length} ${records.length === 1 ? 'inspection' : 'inspections'}`
                : ''}
            </span>
            {filterCount > 0 && (
              <button type="button" className="text-button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
      <div className="records" aria-busy={loading}>
        {body}
      </div>
      {selected !== null && (
        <InspectionDetail id={selected} onClose={() => setSelected(null)} onResolved={onResolved} />
      )}
    </section>
  );
}
