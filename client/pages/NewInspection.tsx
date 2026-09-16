import { useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowLeft, ClipboardCheck, Plus, LoaderCircle } from 'lucide-react';
import {
  createInspectionSchema,
  defectTypes,
  severities,
  type Inspection,
} from '../../shared/schema';
import { api, ApiError } from '../api';
import { localToday, navigate } from '../utils';
import { ErrorState, Field } from '../components/ui';

export default function NewInspection({ onSaved }: { onSaved: (record: Inspection) => void }) {
  const [fields, setFields] = useState({
    date: localToday(),
    machineId: '',
    defectType: '',
    severity: '',
    remarks: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const update = (key: keyof typeof fields, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: '' }));
  };
  const invalid = (key: string) => ({
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const result = createInspectionSchema.safeParse(fields);
    if (!result.success) {
      const messages = Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path[0],
          issue.path[0] === 'defectType'
            ? 'Choose a defect type.'
            : issue.path[0] === 'severity'
              ? 'Choose a severity.'
              : issue.message,
        ]),
      );
      setErrors(messages);
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setSaving(true);
    setFailure('');
    setErrors({});
    try {
      onSaved(
        await api<Inspection>('/inspections', {
          method: 'POST',
          body: JSON.stringify(result.data),
        }),
      );
    } catch (error) {
      setFailure((error as Error).message);
      if (error instanceof ApiError) setErrors(error.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="new-layout">
      <form className="panel inspection-form" ref={form} onSubmit={submit} noValidate>
        <div className="panel-heading">
          <div>
            <h2>Inspection details</h2>
            <p className="section-description">
              Fields marked <span className="required">*</span> are required.
            </p>
          </div>
          <ClipboardCheck className="section-icon" size={25} />
        </div>
        <div className="form-body">
          {failure && <ErrorState message={failure} />}
          <div className="form-grid">
            <Field id="date" label="Inspection date" required error={errors.date}>
              <input
                id="date"
                type="date"
                required
                value={fields.date}
                onChange={(e) => update('date', e.target.value)}
                {...invalid('date')}
              />
            </Field>
            <Field id="machineId" label="Machine / line ID" required error={errors.machineId}>
              <input
                id="machineId"
                placeholder="e.g. LOOM-A12"
                required
                maxLength={100}
                value={fields.machineId}
                onChange={(e) => update('machineId', e.target.value)}
                {...invalid('machineId')}
              />
            </Field>
            <Field id="defectType" label="Defect type" required error={errors.defectType}>
              <select
                id="defectType"
                required
                value={fields.defectType}
                onChange={(e) => update('defectType', e.target.value)}
                {...invalid('defectType')}
              >
                <option value="">Select defect type</option>
                {defectTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <Field id="severity" label="Severity" required error={errors.severity}>
              <select
                id="severity"
                required
                value={fields.severity}
                onChange={(e) => update('severity', e.target.value)}
                {...invalid('severity')}
              >
                <option value="">Select severity</option>
                {severities.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            id="remarks"
            label="Remarks"
            error={errors.remarks}
            hint={`${fields.remarks.length.toLocaleString()} / 2,000 characters · Optional`}
          >
            <textarea
              id="remarks"
              rows={5}
              placeholder="Describe what you observed, where it occurred, or anything that will help the team investigate."
              maxLength={2000}
              value={fields.remarks}
              onChange={(e) => update('remarks', e.target.value)}
              {...invalid('remarks')}
            />
          </Field>
        </div>
        <div className="form-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate('inspections')}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />}
            {saving ? 'Saving…' : 'Save inspection'}
          </button>
        </div>
      </form>
      <aside className="form-guide">
        <span className="guide-icon">
          <Activity size={25} />
        </span>
        <h2>A useful observation goes a long way.</h2>
        <p>
          Record the machine ID exactly as it appears on the floor, then choose the defect and its
          severity.
        </p>
        <div className="guide-step">
          <span>01</span>
          <div>
            <strong>Capture the issue</strong>
            <p>Add context in remarks so the next person knows where to start.</p>
          </div>
        </div>
        <div className="guide-step">
          <span>02</span>
          <div>
            <strong>Track the action</strong>
            <p>New inspections appear as Open in the register.</p>
          </div>
        </div>
        <div className="guide-step">
          <span>03</span>
          <div>
            <strong>Close the loop</strong>
            <p>Resolve the inspection with a note explaining what was done.</p>
          </div>
        </div>
        <button className="text-button" onClick={() => navigate('inspections')}>
          <ArrowLeft size={15} />
          Back to inspections
        </button>
      </aside>
    </div>
  );
}
