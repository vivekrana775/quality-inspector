import type { Inspection } from '../../shared/schema';
import { dateLabel } from '../utils';
import { Badge } from './ui';

export function InspectionCards({
  records,
  onSelect,
}: {
  records: Inspection[];
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="cards">
      {records.map((record) => (
        <li key={record.id}>
          <button
            type="button"
            className="inspection-card"
            onClick={() => onSelect(record.id)}
            aria-label={`View ${record.machineId}, ${record.defectType}, ${record.severity}, ${record.status}`}
          >
            <span className="card-top">
              <span className="card-machine">{record.machineId}</span>
              <Badge value={record.severity} />
            </span>
            <span className="card-defect">{record.defectType}</span>
            <span className="card-meta">
              <Badge value={record.status} />
              <span>{dateLabel(record.date)}</span>
              <span>
                #{record.id}
                {record.source === 'SAP' ? ' · SAP' : ''}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
