import { emptyAppData, SPORTS_HABIT_ID } from './data.models';
import { parseLegacyData } from './focus-store.service';

/** Verifies LocalStorage migration parsing and generated habit behavior. */
describe('parseLegacyData', () => {
  /** Rejects values that cannot represent an application snapshot. */
  it('returns null for invalid snapshots', () => {
    expect(parseLegacyData(null)).toBeNull();
    expect(parseLegacyData('not data')).toBeNull();
  });

  /** Preserves sessions awaiting rating during the legacy import. */
  it('restores the pending review as an unrated session', () => {
    const data = {
      ...emptyAppData(),
      pendingSession: {
        id: 'session-1', title: 'Writing', category: 'Deep Work', startAt: '2026-10-20T09:00:00Z',
        endAt: '2026-10-20T09:30:00Z', durationMinutes: 30, notes: '',
      },
    };

    const migrated = parseLegacyData(data);

    expect(migrated?.sessions[0].rating).toBe(0);
    expect(migrated?.pendingSession?.id).toBe('session-1');
    expect(migrated?.sessions[0].category).toBe('Other');
    expect(migrated?.sessions[0].isDeepWork).toBe(true);
  });

  /** Adds the generated Sport habit when importing workout history. */
  it('creates one auto-tracked Sport habit for imported workouts', () => {
    const data = emptyAppData();
    data.sports = [{ id: 'sport-1', sport: 'Running', durationMinutes: 30, date: '2026-10-20', intensity: 3, notes: '' }];

    const migrated = parseLegacyData(data);

    expect(migrated?.habits.filter(item => item.id === SPORTS_HABIT_ID)).toHaveLength(1);
    expect(migrated?.habits.find(item => item.id === SPORTS_HABIT_ID)?.name).toBe('Sport');
  });
});
