import {
  dateSchema,
  severities,
  sortFields,
  statuses,
  type InspectionStatus,
  type Severity,
  type SortField,
  type SortOrder,
} from '../shared/schema';

export interface ListQuery {
  severity: Severity | '';
  status: InspectionStatus | '';
  dateFrom: string;
  dateTo: string;
  sortBy: SortField;
  sortOrder: SortOrder;
}

export const defaultSortOrder: Record<SortField, SortOrder> = {
  date: 'desc',
  severity: 'desc',
  machineId: 'asc',
  status: 'asc',
};

export const sortFieldLabels: Record<SortField, string> = {
  date: 'Date',
  severity: 'Severity',
  machineId: 'Machine',
  status: 'Status',
};

export const sortLabels: Record<SortField, Record<SortOrder, string>> = {
  date: { desc: 'Newest first', asc: 'Oldest first' },
  severity: { desc: 'Critical first', asc: 'Minor first' },
  machineId: { asc: 'A to Z', desc: 'Z to A' },
  status: { asc: 'Open first', desc: 'Resolved first' },
};

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | '' =>
  values.find((candidate) => candidate === value) ?? '';

const validDate = (value: string | null) =>
  value && dateSchema.safeParse(value).success ? value : '';

// Anything odd in the URL is dropped here rather than forwarded to the API.
export function readListQuery(params: URLSearchParams): ListQuery {
  const sortBy = oneOf(sortFields, params.get('sortBy')) || 'date';
  const sortOrder =
    oneOf(['asc', 'desc'] as const, params.get('sortOrder')) || defaultSortOrder[sortBy];
  return {
    severity: oneOf(severities, params.get('severity')),
    status: oneOf(statuses, params.get('status')),
    dateFrom: validDate(params.get('dateFrom')),
    dateTo: validDate(params.get('dateTo')),
    sortBy,
    sortOrder,
  };
}

// Builds both the hash and the API query string, so the two can't drift apart.
export function toSearchParams(query: ListQuery) {
  const params = new URLSearchParams();
  for (const key of ['severity', 'status', 'dateFrom', 'dateTo'] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  if (query.sortBy !== 'date' || query.sortOrder !== 'desc') {
    params.set('sortBy', query.sortBy);
    params.set('sortOrder', query.sortOrder);
  }
  return params;
}

export const activeFilterCount = (query: ListQuery) =>
  [query.severity, query.status, query.dateFrom, query.dateTo].filter(Boolean).length;
