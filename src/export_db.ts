import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { dbFilePath } from './db';

function sqlStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const outputPath = path.resolve(path.dirname(dbFilePath), 'netsuite.upload.db');
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  if (!fs.existsSync(dbFilePath)) {
    throw new Error(`Database file not found: ${dbFilePath}`);
  }

  const db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READWRITE,
  });

  try {
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (_) {
    // ignore
  }

  try {
    await db.exec(`VACUUM INTO ${sqlStringLiteral(outputPath)}`);
  } catch (_) {
    try {
      await db.exec('PRAGMA journal_mode = DELETE');
    } catch (_) {
      // ignore
    }
    try {
      await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (_) {
      // ignore
    }
    await fs.promises.copyFile(dbFilePath, outputPath);
  } finally {
    await db.close();
  }

  process.stdout.write(`${outputPath}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

