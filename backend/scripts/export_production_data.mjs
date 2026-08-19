import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import fs from 'fs';
import path from 'path';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

export async function exportProductionData(outputDir = './backend/backups') {
  console.log('=== STARTING PRODUCTION DATA EXPORT ===\n');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportFileName = `production_export_${timestamp}.json`;
  const exportFilePath = path.join(outputDir, exportFileName);

  const bookings = Array.from(bookingRepository.bookingsMemoryStore?.values?.() || []);
  const exportedBookings = [];

  for (const b of bookings) {
    if (b && !b._deleted) {
      const fullExport = await bookingRepository.exportBookingJson(b.id || b.confirmation_code);
      if (fullExport) exportedBookings.push(fullExport);
    }
  }

  const exportData = {
    export_metadata: {
      exported_at: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      total_records: exportedBookings.length
    },
    bookings: exportedBookings
  };

  fs.writeFileSync(exportFilePath, JSON.stringify(exportData, null, 2), 'utf8');
  console.log(`✔ Production export written to: ${exportFilePath}`);
  console.log(`✔ Total Canonical Bookings Exported: ${exportedBookings.length}\n`);

  return exportFilePath;
}

if (process.argv[1]?.includes('export_production_data')) {
  exportProductionData().catch(err => {
    console.error('❌ Production Export Failed:', err);
    process.exit(1);
  });
}
