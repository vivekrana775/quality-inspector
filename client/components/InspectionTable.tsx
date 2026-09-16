import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Inspection, SortField, SortOrder } from '../../shared/schema';
import { dateLabel } from '../utils';
import { Badge } from './ui';

const columns: { field?: SortField; label: string }[] = [
  { field: 'date', label: 'Date' },
  { field: 'machineId', label: 'Machine / line' },
  { label: 'Defect type' },
  { field: 'severity', label: 'Severity' },
  { field: 'status', label: 'Status' },
];

export function InspectionTable({
  records,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
}: {
  records: Inspection[];
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onSelect: (id: number) => void;
}) {
  const Arrow = sortOrder === 'desc' ? ArrowDown : ArrowUp;
  return (
    <table className="records-table">
      <thead>
        <tr>
          {columns.map(({ field, label }) => (
            <th
              key={label}
              aria-sort={
                field && field === sortBy
                  ? sortOrder === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              }
            >
              {field ? (
                <button type="button" onClick={() => onSort(field)}>
                  {label}
                  {field === sortBy && <Arrow size={13} />}
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
              {dateLabel(record.date)}
              <span className="table-sub">#{record.id}</span>
            </td>
            <td>
              <button type="button" className="machine-link" onClick={() => onSelect(record.id)}>
                {record.machineId}
              </button>
              {record.source === 'SAP' && <span className="table-sub">SAP</span>}
            </td>
            <td>{record.defectType}</td>
            <td>
              <Badge value={record.severity} />
            </td>
            <td>
              <Badge value={record.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
