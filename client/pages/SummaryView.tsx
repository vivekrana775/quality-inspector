import { BarChart3, CheckCircle2, Clock3 } from 'lucide-react';
import type { Summary } from '../../shared/schema';
import { Badge, Loading } from '../components/ui';

export default function SummaryView({
  summary,
  loading,
  error,
}: {
  summary?: Summary;
  loading: boolean;
  error: string;
}) {
  if (loading)
    return (
      <section className="panel">
        <Loading />
      </section>
    );
  if (error || !summary) return null;
  const rate = summary.total ? Math.round((summary.resolved / summary.total) * 100) : 0;
  return (
    <div className="summary-layout">
      <section className="panel severity-summary">
        <div className="panel-heading">
          <div>
            <h2>Breakdown by severity</h2>
            <p className="section-description">All inspections · All dates</p>
          </div>
          <BarChart3 size={23} className="section-icon" />
        </div>
        <table>
          <caption className="sr-only">
            Open and Resolved inspection counts by severity across all inspections
          </caption>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Open</th>
              <th>Resolved</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {summary.bySeverity.map((row) => (
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
          <tfoot>
            <tr>
              <th scope="row">All severities</th>
              <td>{summary.open}</td>
              <td>{summary.resolved}</td>
              <td>{summary.total}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <section className="resolution-overview">
        <span className="guide-icon">
          <CheckCircle2 size={26} />
        </span>
        <h2>Resolution progress</h2>
        <p>Across all inspections</p>
        <strong className="progress-value">
          {rate}
          <span>%</span>
        </strong>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Resolved inspections"
          aria-valuenow={rate}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${rate}%` }} />
        </div>
        <p className="progress-caption">
          {summary.resolved} of {summary.total} inspections resolved
        </p>
        <div className="progress-footer">
          <Clock3 size={18} />
          <span>
            {summary.open === 0
              ? 'No open inspections right now.'
              : `${summary.open} ${summary.open === 1 ? 'inspection needs' : 'inspections need'} follow-up.`}
          </span>
        </div>
      </section>
    </div>
  );
}
