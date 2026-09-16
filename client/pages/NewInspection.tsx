import { useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import {
  createInspectionSchema,
  defectTypes,
  severities,
  type CreateInspection,
  type Inspection,
} from '../../shared/schema';
import { api, ApiError } from '../api';
import { enqueue } from '../outbox';
import { localToday, navigate, uuid } from '../utils';
import { ErrorState, Field } from '../components/ui';

// Zod's enum message lists the allowed values, which is noise next to an empty <select>.
const selectMessages: Record<string, string> = {
  defectType: 'Choose a defect type.',
  severity: 'Choose a severity.',
};

export default function NewInspection({
  onSaved,
  onQueued,
}: {
  onSaved: (record: Inspection) => void;
  onQueued: () => void;
}) {
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
  // One reference per form, so retrying after a lost response can't save twice.
  const clientRef = useRef(uuid());

  const update = (key: keyof typeof fields, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: '' }));
  };
  const invalid = (key: string) => ({
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  });

  function queue(input: CreateInspection) {
    if (enqueue({ ...input, clientRef: clientRef.current })) return onQueued();
    setFailure(
      "Cannot reach the server, and this browser can't store inspections offline. Keep this page open and try again.",
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const result = createInspectionSchema.safeParse({ ...fields, clientRef: clientRef.current });
    if (!result.success) {
      const messages = Object.fromEntries(
        result.error.issues.map((issue) => {
          const key = String(issue.path[0]);
          return [key, selectMessages[key] ?? issue.message];
        }),
      );
      setErrors(messages);
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (!navigator.onLine) return queue(result.data);
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
      if (error instanceof ApiError && error.status === 0) return queue(result.data);
      setFailure((error as Error).message);
      if (error instanceof ApiError) setErrors(error.fields);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" ref={form} onSubmit={submit} noValidate>
      <div className="panel-heading">
        <div>
          <h2>Inspection details</h2>
          <p className="section-description">
            Fields marked <span className="required">*</span> are required.
          </p>
        </div>
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
          hint={`Optional · ${fields.remarks.length.toLocaleString()} / 2,000`}
        >
          <textarea
            id="remarks"
            rows={4}
            placeholder="What you saw, where on the roll, anything that helps the next person."
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
  );
}
