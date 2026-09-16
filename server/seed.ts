import { InspectionStore } from './database.js';
import { databasePath } from './config.js';
import { defectTypes, severities } from '../shared/schema.js';

const store = new InspectionStore(databasePath);
try {
  if (store.summary().total > 0) {
    console.log('Sample data skipped: the database already contains inspections.');
  } else {
    const machines = ['LOOM-A12', 'DYE-B04', 'LOOM-C08', 'SPIN-A03', 'LOOM-B16', 'FINISH-C02'];
    const remarks = [
      'Broken warp threads near the selvedge.',
      'Shade differs from approved reference.',
      'Small tear found during roll inspection.',
      'Yarn count outside the expected range.',
      'Uneven weave observed on the sample.',
      'Surface marking on the finished roll.',
    ];
    const notes = [
      'Replaced the damaged guide and verified a fresh sample.',
      'Adjusted the process settings and rechecked the batch.',
      'Cleaned the rollers; the next inspection passed.',
    ];
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const record = store.create({
        date: localDate,
        machineId: machines[i],
        defectType: defectTypes[i % defectTypes.length],
        severity: severities[i % 3],
        remarks: remarks[i],
      });
      if (i >= 3) store.resolve(record.id, notes[i - 3]);
    }
    console.log('Created 6 illustrative inspections (one Open and one Resolved per severity).');
  }
} finally {
  store.close();
}
