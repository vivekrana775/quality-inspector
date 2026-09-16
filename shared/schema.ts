import { z } from 'zod';

export const defectTypes = [
  'Weave Defect',
  'Shade Variation',
  'Hole/Tear',
  'Count Deviation',
  'Other',
] as const;
export const severities = ['Critical', 'Major', 'Minor'] as const;
export const statuses = ['Open', 'Resolved'] as const;
export const sortFields = ['date', 'severity', 'machineId', 'status'] as const;

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      value.slice(0, 4) !== '0000' &&
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Enter a real calendar date.');

export const createInspectionSchema = z.strictObject({
  date: dateSchema,
  machineId: z
    .string()
    .trim()
    .min(1, 'Enter a machine or line ID.')
    .max(100, 'Use 100 characters or fewer.'),
  defectType: z.enum(defectTypes),
  severity: z.enum(severities),
  remarks: z.string().trim().max(2000, 'Use 2,000 characters or fewer.').default(''),
});

export const resolveInspectionSchema = z.strictObject({
  resolutionNote: z
    .string()
    .trim()
    .min(1, 'Add a resolution note before resolving.')
    .max(2000, 'Use 2,000 characters or fewer.'),
});

export const filterSchema = z
  .strictObject({
    severity: z.enum(severities).optional(),
    status: z.enum(statuses).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    sortBy: z.enum(sortFields).default('date'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'The end date must be on or after the start date.',
    path: ['dateTo'],
  });

export type CreateInspection = z.infer<typeof createInspectionSchema>;
export type InspectionFilters = z.infer<typeof filterSchema>;
export type Severity = (typeof severities)[number];
export type InspectionStatus = (typeof statuses)[number];
export interface Inspection extends CreateInspection {
  id: number;
  status: InspectionStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  source: 'Manual' | 'SAP';
}
export interface Summary {
  total: number;
  open: number;
  resolved: number;
  bySeverity: { severity: Severity; open: number; resolved: number }[];
}
export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
