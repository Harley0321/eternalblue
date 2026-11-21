import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoSafetyBackupRepository } from '../src/data/autoSafetyBackups';

test('automatic safety backups keep the latest copy and three daily restore points', async () => {
  const repository = createAutoSafetyBackupRepository(`test-safety-${Date.now()}-${Math.random()}`);

  for (let day = 18; day <= 21; day++) {
    const date = new Date(2026, 10, day, 12);
    await repository.saveLatestAndDaily(`snapshot-${day}`, day, day * 2, date);
  }

  const backups = await repository.list();
  assert.equal(backups.length, 4);
  assert.equal(backups[0].kind, 'latest');
  assert.equal(await repository.load('latest'), 'snapshot-21');
  assert.deepEqual(
    backups.filter((backup) => backup.kind === 'daily').map((backup) => backup.dayKey),
    ['2026-11-21', '2026-11-20', '2026-11-19']
  );
  assert.equal(await repository.load('daily:2026-11-20'), 'snapshot-20');

  await repository.clear();
  assert.deepEqual(await repository.list(), []);
});

test('daily safety copies keep the first snapshot of the day while the latest copy advances', async () => {
  const repository = createAutoSafetyBackupRepository(`test-safety-daily-${Date.now()}-${Math.random()}`);
  const morning = new Date(2026, 10, 21, 8);
  const afternoon = new Date(2026, 10, 21, 16);

  await repository.saveLatestAndDaily('morning', 1, 2, morning);
  await repository.saveLatestAndDaily('afternoon', 3, 4, afternoon);

  assert.equal(await repository.load('latest'), 'afternoon');
  assert.equal(await repository.load('daily:2026-11-21'), 'morning');
  await repository.clear();
});
