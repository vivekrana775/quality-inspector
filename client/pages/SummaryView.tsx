import { CheckCircle2, ClipboardList, Clock3 } from 'lucide-react';
import type { Summary } from '../../shared/schema';
import { useApi } from '../api';
import { Badge, ErrorState, Loading } from '../components/ui';

export default function SummaryView() {
  const { data, loading, error, reload } = useApi<Summary>('/inspections/summary');
  if (loading && !data) return <Loading label="Loading summary…" />;
  if (!data) return <ErrorState message={error || 'The summary is unavailable.'} retry={reload} />;

  const metrics = [
    { label: 'Total', value: data.total, icon: ClipboardList, tone: 'neutral' },
    { label: 'Open', value: data.open, icon: Clock3, tone: 'amber' },
    { label: 'Resolved', value: data.resolved, icon: CheckCircle2, tone: 'green' },
  ];
  return (
    <>
      <div className="metrics">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <section className={`metric ${tone}`} key={label} aria-label={`${label} inspections`}>
            <Icon size={18} />
            <p>{label}</p>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      <section className="panel severity-summary">
        <div className="panel-heading">
          <div>
            <h2>Breakdown by severity</h2>
            <p className="section-description">All inspections · All dates</p>
          </div>
        </div>
        <table>
          <caption className="sr-only">Open and Resolved inspection counts by severity</caption>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Open</th>
              <th>Resolved</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.bySeverity.map((row) => (
              <tr key={row.severity}>
                <th scope="row">
                  <Badge value={row.severity} />
                </th>
                <td className="open-count">{row.open}</td>
                <td className="resolved-count">{row.resolved}</td>
                <td>{row.open + row.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
