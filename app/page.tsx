'use client';

import { useEffect, useMemo, useState } from 'react';

type Preference = 'even' | 'weekday' | 'holiday';
type HolidayInfo = { name: string; type: 'holiday' | 'workday' };

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const makeDate = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);
const holidayData: Record<string, HolidayInfo> = {};

function addRange(year: number, month: number, from: number, to: number, name: string) {
  for (let day = from; day <= to; day += 1) holidayData[dateKey(makeDate(year, month, day))] = { name, type: 'holiday' };
}
function addHolidayRange(start: [number, number, number], days: number, name: string) {
  const cursor = makeDate(...start);
  for (let index = 0; index < days; index += 1) {
    holidayData[dateKey(cursor)] = { name, type: 'holiday' };
    cursor.setDate(cursor.getDate() + 1);
  }
}

// 国务院办公厅公布的 2025、2026 年部分节假日安排。
addRange(2025, 1, 1, 1, '元旦');
addHolidayRange([2025, 1, 28], 8, '春节');
addRange(2025, 4, 4, 6, '清明节');
addRange(2025, 5, 1, 5, '劳动节');
addHolidayRange([2025, 5, 31], 3, '端午节');
addRange(2025, 10, 1, 8, '国庆·中秋');
['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11'].forEach((key) => { holidayData[key] = { name: '调休上班', type: 'workday' }; });
addRange(2026, 1, 1, 3, '元旦');
addRange(2026, 2, 15, 23, '春节');
addRange(2026, 4, 4, 6, '清明节');
addRange(2026, 5, 1, 5, '劳动节');
addRange(2026, 6, 19, 21, '端午节');
addRange(2026, 9, 25, 27, '中秋节');
addRange(2026, 10, 1, 7, '国庆节');
['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'].forEach((key) => { holidayData[key] = { name: '调休上班', type: 'workday' }; });

function getCalendarDays(year: number, month: number) {
  const first = makeDate(year, month, 1);
  const start = makeDate(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
}
function getWeekendGroups(year: number, month: number) {
  const groups: string[][] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const date = makeDate(year, month, day);
    if (date.getDay() !== 6) continue;
    const group = [dateKey(date)];
    const sunday = new Date(date); sunday.setDate(day + 1);
    if (sunday.getMonth() === month - 1) group.push(dateKey(sunday));
    groups.push(group);
  }
  return groups;
}
const formatHours = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

export default function Home() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [targetHours, setTargetHours] = useState(36);
  const [weekendsOff, setWeekendsOff] = useState(2);
  const [preference, setPreference] = useState<Preference>('even');
  const [actual, setActual] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('overtime-planner-v1');
      if (saved) {
        const state = JSON.parse(saved);
        setTargetHours(Number(state.targetHours) || 36);
        setWeekendsOff(Number(state.weekendsOff) || 0);
        setPreference(state.preference || 'even');
        setActual(state.actual || {});
      }
    } catch { /* 无本地存储时仍保持可用 */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem('overtime-planner-v1', JSON.stringify({ targetHours, weekendsOff, preference, actual }));
  }, [actual, loaded, preference, targetHours, weekendsOff]);

  const days = useMemo(() => getCalendarDays(year, month), [year, month]);
  const weekendGroups = useMemo(() => getWeekendGroups(year, month), [year, month]);
  const maxWeekends = weekendGroups.length;
  useEffect(() => setWeekendsOff((value) => Math.min(value, maxWeekends)), [maxWeekends]);
  const monthPrefix = `${year}-${pad(month)}-`;
  const actualTotal = useMemo(() => Object.entries(actual).reduce((sum, [key, value]) => key.startsWith(monthPrefix) ? sum + (Number(value) || 0) : sum, 0), [actual, monthPrefix]);
  const reservedWeekendKeys = useMemo(() => new Set(weekendGroups.filter((group) => group.some((key) => holidayData[key]?.type !== 'workday' && (actual[key] || 0) === 0)).slice(0, weekendsOff).flat()), [actual, weekendGroups, weekendsOff]);

  const suggestions = useMemo(() => {
    const remaining = Math.max(0, targetHours - actualTotal);
    if (remaining <= 0) return {} as Record<string, number>;
    const todayKey = dateKey(now);
    const candidates = days.filter((date) => {
      if (date.getMonth() !== month - 1) return false;
      const key = dateKey(date), info = holidayData[key];
      if (key < todayKey || (actual[key] || 0) > 0 || info?.type === 'holiday') return false;
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      if (reservedWeekendKeys.has(key) && info?.type !== 'workday') return false;
      return !(preference === 'weekday' && weekend && info?.type !== 'workday');
    });
    const ordered = [...candidates].sort((a, b) => {
      if (preference !== 'holiday') return a.getTime() - b.getTime();
      const aWeekend = a.getDay() === 0 || a.getDay() === 6, bWeekend = b.getDay() === 0 || b.getDay() === 6;
      return Number(aWeekend) - Number(bWeekend) || a.getTime() - b.getTime();
    });
    if (!ordered.length) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    let left = Math.round(remaining * 2) / 2, active = [...ordered];
    while (left > 0 && active.length) {
      const share = Math.max(.5, Math.ceil((left / active.length) * 2) / 2), next: Date[] = [];
      active.forEach((date) => {
        if (left <= 0) return;
        const key = dateKey(date), weekend = date.getDay() === 0 || date.getDay() === 6;
        const cap = weekend && holidayData[key]?.type !== 'workday' ? 6 : 3, current = result[key] || 0;
        const amount = Math.min(share, cap - current, left);
        if (amount > 0) { result[key] = Math.round((current + amount) * 2) / 2; left = Math.round((left - amount) * 2) / 2; }
        if ((result[key] || 0) < cap) next.push(date);
      });
      active = next;
    }
    return result;
  }, [actual, actualTotal, days, month, now, preference, reservedWeekendKeys, targetHours]);

  const remaining = Math.max(0, targetHours - actualTotal);
  const progress = targetHours > 0 ? Math.min(100, Math.round(actualTotal / targetHours * 100)) : 0;
  const coverage = Object.values(suggestions).reduce((sum, value) => sum + value, 0);
  const notify = () => { setToast(true); window.setTimeout(() => setToast(false), 2200); };
  const changeMonth = (offset: number) => { const next = makeDate(year, month + offset, 1); setYear(next.getFullYear()); setMonth(next.getMonth() + 1); };
  const updateActual = (key: string, value: string) => { const parsed = Math.max(0, Math.min(24, Number(value) || 0)); setActual((current) => ({ ...current, [key]: Math.round(parsed * 2) / 2 })); notify(); };
  const resetMonth = () => { setActual((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(monthPrefix)))); notify(); };

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><div><h1>加班规划助手</h1><p>智能分配每月加班时间</p></div></div>
      <div className="header-actions">
        <div className="month-switcher" aria-label="月份切换"><button onClick={() => changeMonth(-1)} aria-label="上个月">‹</button><button className="month-label">{year}年{month}月</button><button onClick={() => changeMonth(1)} aria-label="下个月">›</button></div>
        <button className="secondary-button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}>今天</button>
        <button className="primary-button" onClick={notify}>↻ <span>重新分配</span></button>
      </div>
    </header>
    <div className="mobile-settings"><button onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}><span>本月设置</span><b>{targetHours}h · {weekendsOff} 个双休</b><span>{settingsOpen ? '收起' : '调整'}</span></button></div>
    <div className="workspace">
      <aside className={`sidebar ${settingsOpen ? 'open' : ''}`}>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">PLAN</span><h2>本月设置</h2></div><span className="status-dot">自动</span></div>
          <label className="field-label" htmlFor="target-hours">本月需加班</label><div className="number-field"><input id="target-hours" type="number" min="0" max="300" step="0.5" value={targetHours} onChange={(event) => setTargetHours(Math.max(0, Number(event.target.value)))} /><span>小时</span></div>
          <label className="field-label" htmlFor="weekends-off">希望完整双休</label><div className="number-field"><input id="weekends-off" type="number" min="0" max={maxWeekends} value={weekendsOff} onChange={(event) => setWeekendsOff(Math.max(0, Math.min(maxWeekends, Number(event.target.value))))} /><span>个周末</span></div><p className="field-help">本月最多可保留 {maxWeekends} 个完整周末</p>
          <span className="field-label">分配偏好</span><div className="segmented" role="group" aria-label="分配偏好">{([['even','均匀分配'],['weekday','集中工作日'],['holiday','避开节假日']] as [Preference,string][]).map(([value,label]) => <button key={value} className={preference === value ? 'active' : ''} onClick={() => setPreference(value)}>{label}</button>)}</div>
          <button className="allocate-button" onClick={() => { setSettingsOpen(false); notify(); }}><span aria-hidden="true">✦</span> 自动分配</button>
        </section>
        <section className="panel progress-panel">
          <div className="panel-heading"><div><span className="eyebrow">PROGRESS</span><h2>本月进度</h2></div><strong className={remaining === 0 ? 'complete' : ''}>{progress}%</strong></div>
          <div className="progress-stats"><div><span>已完成</span><b className="done">{formatHours(actualTotal)}h</b></div><div><span>待完成</span><b>{formatHours(remaining)}h</b></div></div>
          <div className="progress-track" aria-label={`完成度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
          <div className="plan-note"><span className="note-icon" aria-hidden="true">▣</span><div><b>剩余 {Object.keys(suggestions).length} 个可安排日期</b><p>当前计划可覆盖 {formatHours(coverage)} 小时</p></div></div>
          <button className="reset-button" onClick={resetMonth}>清空本月实际记录</button>
        </section>
        <p className="data-note">节假日数据已包含 2025–2026 年国务院办公厅公布安排</p>
      </aside>
      <section className="calendar-area">
        {toast && <div className="toast" role="status"><span>✓</span> 已根据实际加班自动调整剩余计划</div>}
        <div className="calendar-header"><div><span className="eyebrow">CALENDAR</span><h2>{year} 年 {month} 月</h2></div><div className="calendar-summary"><span className="summary-dot" /> 建议安排 <b>{formatHours(coverage)}h</b></div></div>
        <div className="calendar-card"><div className="weekday-row">{WEEKDAYS.map((day,index) => <div key={day} className={index > 4 ? 'weekend-heading' : ''}>{day}<small>{index > 4 ? '休息日' : '工作日'}</small></div>)}</div>
          <div className="calendar-grid">{days.map((date) => {
            const key = dateKey(date), inMonth = date.getMonth() === month - 1, info = holidayData[key], weekend = date.getDay() === 0 || date.getDay() === 6, isToday = key === dateKey(now), isReserved = inMonth && reservedWeekendKeys.has(key) && info?.type !== 'workday', value = actual[key] || 0, suggestion = suggestions[key] || 0;
            return <article key={key} className={`day-cell ${!inMonth ? 'outside' : ''} ${weekend ? 'weekend' : ''} ${info?.type || ''} ${isToday ? 'today' : ''}`}>
              <div className="day-top"><span className="date-number">{date.getDate()}</span>{isToday && <span className="today-badge">今天</span>}</div>
              <div className="day-flags">{info && <span className={`holiday-tag ${info.type}`}>{info.type === 'workday' ? '班' : '休'} · {info.name}</span>}{isReserved && !info && <span className="off-tag">完整双休</span>}{value > 0 ? <span className="done-tag">✓ 已加班 {formatHours(value)}h</span> : suggestion > 0 ? <span className="suggestion-tag">建议 {formatHours(suggestion)}h</span> : null}</div>
              {inMonth && <label className="actual-input"><span>实际</span><input aria-label={`${month}月${date.getDate()}日实际加班小时`} type="number" min="0" max="24" step="0.5" value={value || ''} placeholder="0" onChange={(event) => updateActual(key, event.target.value)} /><i>h</i></label>}
            </article>;
          })}</div>
        </div>
        <footer className="legend"><span><i className="legend-workday" />工作日</span><span><i className="legend-weekend" />周末</span><span><i className="legend-holiday" />法定节假日</span><span><i className="legend-shift" />调休上班</span><em>输入实际时长后，建议计划会自动更新</em></footer>
      </section>
    </div>
    <div className={`sidebar-backdrop ${settingsOpen ? 'show' : ''}`} onClick={() => setSettingsOpen(false)} />
  </main>;
}
