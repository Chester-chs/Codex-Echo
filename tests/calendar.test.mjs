import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey, resetOverview, monthGrid, moveMonth} from '../src/lib/calendar.mjs';

const now = Date.parse('2026-10-16T20:00:00Z');
const record = (id, postedAt, type='automatic') => ({id, postedAt, type, resetAt:null});

test('mixed announcements count once in total and in each relevant type',()=>{
 const mixed={...record('both','2026-10-16T10:00:00Z'),resetTypes:['automatic','banked']};
 const result=resetOverview([mixed,record('unknown','2026-10-16T09:00:00Z','unknown')],'Europe/London',now);
 assert.equal(result.total,2);assert.equal(result.automatic,1);assert.equal(result.banked,1);assert.equal(result.mixed,1);assert.equal(result.unknown,1);
 assert.deepEqual(monthGrid('2026-10',result,'2026-10-16').cells.find(c=>c?.key==='2026-10-16').types,['automatic','banked','unknown']);
});
test('calendar dates follow the chosen timezone across midnight and DST', () => {
  assert.equal(dayKey('2026-10-15T23:30:00Z','Europe/London'),'2026-10-16');
  assert.equal(dayKey('2026-10-25T23:30:00Z','Europe/London'),'2026-10-25');
  assert.equal(dayKey('2026-10-15T23:30:00Z','Asia/Shanghai'),'2026-10-16');
  assert.equal(dayKey('2026-10-15T23:30:00Z','UTC'),'2026-10-15');
  assert.equal(dayKey('invalid','UTC'),null);
});
test('statistics count unique announcements, exclude forecasts and future posts, and keep banked separate', () => {
  const rows = [record('a','2026-10-15T23:30:00Z'),record('b','2026-10-16T00:30:00Z','banked'),record('a','2026-10-15T23:30:00Z'),record('c','2026-10-14T12:00:00Z','forecastSignal'),record('d','2026-10-17T00:00:00Z'),record('e','invalid')];
  const result = resetOverview(rows,'Europe/London',now);
  assert.equal(result.total,2); assert.equal(result.automatic,1); assert.equal(result.banked,1);
  assert.equal(result.recordedDays,1); assert.equal(result.latest.id,'b');
  assert.deepEqual(result.byDay['2026-10-16'].map(r=>r.id),['b','a']);
  assert.equal(result.latest.resetAt,null);
});
test('month calendar is Monday-first, marks today and preserves multiple records on one day', () => {
  const overview=resetOverview([record('a','2026-10-15T23:30:00Z'),record('b','2026-10-16T00:30:00Z','banked')],'Europe/London',now);
  const grid=monthGrid('2026-10',overview,'2026-10-16');
  assert.deepEqual(grid.cells.slice(0,4).map(c=>c?.day??null),[null,null,null,1]);
  assert.equal(grid.cells.length%7,0); assert.equal(grid.cells.filter(Boolean).length,31);
  assert.equal(grid.total,2); assert.equal(grid.recordedDays,1);
  const day=grid.cells.find(c=>c?.day===16);
  assert.equal(day.today,true); assert.equal(day.records.length,2); assert.deepEqual(day.types,['automatic','banked']);
  assert.equal(grid.cells.find(c=>c?.day===17).records.length,0);
});
test('calendar handles leap years, year boundaries, empty months and empty history', () => {
  const empty=resetOverview([],'UTC',now);
  assert.equal(empty.latest,null); assert.equal(empty.total,0);
  assert.equal(monthGrid('2024-02',empty,'2026-10-16').cells.filter(Boolean).length,29);
  assert.equal(monthGrid('2025-02',empty,'2026-10-16').cells.filter(Boolean).length,28);
  assert.equal(monthGrid('2026-10',empty,'2026-10-16').total,0);
  assert.equal(moveMonth('2026-12',1),'2027-01'); assert.equal(moveMonth('2026-01',-1),'2025-12');
});
