// Historical marks use publication dates. Planned targets have a separate marker and never count as history.
export const announcementTypes = record => [...new Set((record.resetTypes?.length?record.resetTypes:[record.type]).filter(type=>['automatic','banked'].includes(type)))];
export function dayKey(value, zone = 'UTC') {
  const date = new Date(value);
  if (value == null || !Number.isFinite(date.getTime())) return null;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit'}); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', {timeZone:'UTC', year:'numeric', month:'2-digit', day:'2-digit'}); }
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function resetOverview(records, zone = 'UTC', now = Date.now()) {
  const seen = new Set();
  const sorted = [...records].filter(r => {
    if (!r.id || seen.has(r.id) || !['automatic','banked','unknown'].includes(r.type) || !Number.isFinite(Date.parse(r.postedAt)) || Date.parse(r.postedAt) > now) return false;
    seen.add(r.id); return true;
  }).sort((a,b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
  const byDay = Object.create(null);
  for (const record of sorted) (byDay[dayKey(record.postedAt,zone)] ||= []).push(record);
  return {records:sorted, byDay, latest:sorted[0] || null, first:sorted.at(-1) || null, total:sorted.length,
    automatic:sorted.filter(r=>announcementTypes(r).includes('automatic')).length, banked:sorted.filter(r=>announcementTypes(r).includes('banked')).length,
    mixed:sorted.filter(r=>announcementTypes(r).length>1).length,unknown:sorted.filter(r=>!announcementTypes(r).length).length,
    recordedDays:Object.keys(byDay).length};
}

export function moveMonth(month, offset) {
  const [year, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year,m-1+offset,1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}`;
}

export function monthGrid(month, overview, today, plan=null, zone='UTC') {
  const [year, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year,m-1,1));
  const length = new Date(Date.UTC(year,m,0)).getUTCDate();
  const cells = Array((first.getUTCDay()+6)%7).fill(null);
  let total=0, recordedDays=0;
  for (let day=1;day<=length;day++) {
    const key=`${month}-${String(day).padStart(2,'0')}`;
    const records=overview.byDay[key] || [];
    total+=records.length; if(records.length)recordedDays++;
    cells.push({key,day,records,planned:Boolean(plan&&['scheduled','awaiting'].includes(plan.phase)&&dayKey(plan.scheduledAt,zone)===key),types:['automatic','banked','unknown'].filter(t=>records.some(r=>t==='unknown'?!announcementTypes(r).length:announcementTypes(r).includes(t))),today:key===today});
  }
  while(cells.length%7)cells.push(null);
  return {cells,total,recordedDays};
}
