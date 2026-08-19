import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import fs from 'fs';
import path from 'path';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

export async function backupDatabaseBeforeMigration(outputDir = './backend/backups') {
  console.log('=== STARTING DATABASE BACKUP BEFORE MIGRATION ===\n');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `db_backup_${timestamp}.json`;
  const backupFilePath = path.join(outputDir, backupFileName);

  const activeBookings = Array.from(bookingRepository.bookingsMemoryStore?.values?.() || []);
  const auditLogs = Array.from(bookingRepository.auditLogsMemoryStore?.values?.() || []);

  const backupData = {
    backup_metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0',
      total_bookings: activeBookings.length,
      total_audit_logs: auditLogs.length
    },
    tables: {
      bookings: activeBookings,
      audit_logs: auditLogs
    }
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`✔ Database backup successfully written to: ${backupFilePath}`);
  console.log(`✔ Total Bookings Backed Up: ${activeBookings.length}`);
  console.log(`✔ Total Audit Logs Backed Up: ${auditLogs.length}\n`);

  return backupFilePath;
}

if (process.argv[1]?.includes('backup_db_before_migration')) {
  backupDatabaseBeforeMigration().catch(err => {
    console.error('❌ Backup Failed:', err);
    process.exit(1);
  });
}
