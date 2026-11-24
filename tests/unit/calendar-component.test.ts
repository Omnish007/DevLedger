import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calendarSource = readFileSync(join(process.cwd(), 'src/renderer/components/ui/calendar.tsx'), 'utf8');
const storySource = readFileSync(join(process.cwd(), 'src/renderer/components/ui/calendar.stories.tsx'), 'utf8');

test('Calendar uses the official DayPicker v10 default class map and current class-name keys', () => {
  assert.match(calendarSource, /getDefaultClassNames\(\)/);
  for (const key of ['month_grid', 'button_previous', 'button_next', 'day_button', 'range_start', 'range_middle', 'range_end']) {
    assert.match(calendarSource, new RegExp(`${key}:`));
  }
  for (const removedKey of ['table:', 'nav_button:', 'day_selected:', 'day_disabled:']) {
    assert.doesNotMatch(calendarSource, new RegExp(removedKey));
  }
});

test('Calendar stories cover single date, date range and month/year navigation', () => {
  assert.match(storySource, /mode="single"/);
  assert.match(storySource, /mode="range"/);
  assert.match(storySource, /captionLayout="dropdown"/);
});
