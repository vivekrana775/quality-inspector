import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { useOnline, type PendingInspection } from '../outbox';
import { dateLabel } from '../utils';
import { Badge } from './ui';

export function PendingSync({
  items,
  onSync,
  onDiscard,
}: {
  items: PendingInspection[];
  onSync: () => void;
  onDiscard: (clientRef: string) => void;
}) {
  const online = useOnline();
  return (
    <section className="panel pending-panel" aria-labelledby="pending-heading">
      <div className="pending-heading">
        <h2 id="pending-heading">
          <CloudOff size={18} />
          Pending sync ({items.length})
        </h2>
        <button type="button" className="button secondary" onClick={onSync} disabled={!online}>
          <RefreshCw size={16} />
          {online ? 'Sync now' : 'Offline'}
        </button>
      </div>
      <ul className="pending-list">
        {items.map((item) => (
          <li key={item.clientRef}>
            <span className="pending-item">
              <strong>{item.machineId}</strong>
              <span>{item.defectType}</span>
              <span>{dateLabel(item.date)}</span>
              <Badge value={item.severity} />
            </span>
            <span className="pending-status">
              {item.error ? (
                <>
                  <span className="pending-error">{item.error}</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onDiscard(item.clientRef)}
                  >
                    <Trash2 size={14} />
                    Discard
                  </button>
                </>
              ) : (
                'Waiting for a connection'
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
