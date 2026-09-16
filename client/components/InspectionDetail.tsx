import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { resolveInspectionSchema, type Inspection } from '../../shared/schema';
import { api, useApi } from '../api';
import { timestampLabel, dateLabel } from '../utils';
import { Badge, Field, ErrorState, Loading } from './ui';

export default function InspectionDetail({
  id,
  onClose,
  onResolved,
}: {
  id: number;
  onClose: () => void;
  onResolved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const { data, loading, error, reload } = useApi<Inspection>(`/inspections/${id}`);
  const [updated, setUpdated] = useState<Inspection>();
  const record = updated || data;
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    opener.current = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);
  function close() {
    // Close before React removes the element so the browser releases modal focus.
    dialog.current?.close();
    onClose();
  }
  async function resolve(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = resolveInspectionSchema.safeParse({ resolutionNote: note });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0].message);
      noteInput.current?.focus();
      return;
    }
    setSaving(true);
    setFailure('');
    setNoteError('');
    try {
      setUpdated(
        await api<Inspection>(`/inspections/${id}/resolve`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        }),
      );
      onResolved();
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      aria-labelledby="detail-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !saving) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">INSPECTION #{String(id).padStart(4, '0')}</p>
            <h2 id="detail-heading">Inspection details</h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            disabled={saving}
            aria-label="Close inspection details"
          >
            <X size={21} />
          </button>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : (
          record && (
            <>
              <div className="detail-identity">
                <div>
                  <span className="detail-machine">{record.machineId}</span>
                  <p>{record.defectType}</p>
                </div>
                <Badge value={record.status} />
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Inspection date</dt>
                  <dd>{dateLabel(record.date)}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>
                    <Badge value={record.severity} />
                  </dd>
                </div>
                <div>
                  <dt>Logged at</dt>
                  <dd>{timestampLabel(record.createdAt)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{record.source === 'SAP' ? 'SAP webhook' : 'Supervisor entry'}</dd>
                </div>
              </dl>
              <div className="detail-remarks">
                <h3>Remarks</h3>
                <p className={!record.remarks ? 'muted' : ''}>
                  {record.remarks || 'No remarks added.'}
                </p>
              </div>
              {record.status === 'Resolved' ? (
                <section className="resolution-complete">
                  <div>
                    <CheckCircle2 size={21} />
                    <h3>Resolution recorded</h3>
                  </div>
                  <p>{record.resolutionNote}</p>
                  <span>Resolved {timestampLabel(record.resolvedAt!)}</span>
                </section>
              ) : (
                <form onSubmit={resolve} noValidate className="resolution-form">
                  <h3>Resolve this inspection</h3>
                  <p className="section-description">
                    Describe the action taken to address the defect.
                  </p>
                  {failure && (
                    <ErrorState
                      message={failure}
                      retry={() => {
                        setFailure('');
                        reload();
                      }}
                    />
                  )}
                  <Field id="resolutionNote" label="Resolution note" required error={noteError}>
                    <textarea
                      ref={noteInput}
                      id="resolutionNote"
                      required
                      rows={4}
                      maxLength={2000}
                      placeholder="What was fixed, adjusted, or verified?"
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        setNoteError('');
                      }}
                      aria-invalid={!!noteError}
                      aria-describedby={noteError ? 'resolutionNote-error' : undefined}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={saving}>
                    {saving ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}
                    {saving ? 'Resolving…' : 'Mark as resolved'}
                  </button>
                </form>
              )}
            </>
          )
        )}
      </div>
    </dialog>
  );
}
