(function () {
  'use strict';

  const STORAGE_KEY = 'overtime-cycle-planner-v2';
  const pad = (value) => String(value).padStart(2, '0');
  const makeDate = (year, month, day) => new Date(year, month - 1, day, 12);
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const formatHours = (value) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const holidayData = {};

  function addRange(year, month, from, to, name) {
    for (let day = from; day <= to; day += 1) holidayData[dateKey(makeDate(year, month, day))] = { name, type: 'holiday' };
  }
  function addHolidayRange(start, days, name) {
    const cursor = makeDate(start[0], start[1], start[2]);
    for (let index = 0; index < days; index += 1) {
      holidayData[dateKey(cursor)] = { name, type: 'holiday' };
      cursor.setDate(cursor.getDate() + 1);
    }
  }

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

  const now = new Date();
  const today = makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  function currentPeriodEnd() {
    if (today.getDate() < 24) return { year: today.getFullYear(), month: today.getMonth() + 1 };
    const next = makeDate(today.getFullYear(), today.getMonth() + 2, 1);
    return { year: next.getFullYear(), month: next.getMonth() + 1 };
  }

  const defaultPeriod = currentPeriodEnd();
  const state = {
    periodYear: defaultPeriod.year,
    periodMonth: defaultPeriod.month,
    settings: {},
    actual: {},
  };

  function applySavedState(saved) {
    if (!saved) return false;
    if (typeof saved !== 'object' || Array.isArray(saved)) return false;
    if (saved.settings !== undefined && (typeof saved.settings !== 'object' || Array.isArray(saved.settings))) return false;
    if (saved.actual !== undefined && (typeof saved.actual !== 'object' || Array.isArray(saved.actual))) return false;
    state.settings = saved.settings || {};
    state.actual = saved.actual || {};
    if (Number.isInteger(saved.periodYear) && Number.isInteger(saved.periodMonth)) {
      state.periodYear = saved.periodYear;
      state.periodMonth = saved.periodMonth;
    }
    return true;
  }

  function loadBrowserState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (applySavedState(saved)) return true;
      {
        const old = JSON.parse(localStorage.getItem('overtime-planner-v1') || 'null');
        if (old) state.actual = old.actual || {};
      }
    } catch (_) { /* 文件模式或隐私模式下仍可正常使用 */ }
    return false;
  }

  function stateSnapshot() {
    return { version: 1, updatedAt: new Date().toISOString(), periodYear: state.periodYear, periodMonth: state.periodMonth, settings: state.settings, actual: state.actual };
  }
  function saveState() {
    const snapshot = stateSnapshot();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch (_) { /* 忽略存储限制 */ }
  }
  function periodId() { return `${state.periodYear}-${pad(state.periodMonth)}`; }
  function getSettings() {
    if (!state.settings[periodId()]) state.settings[periodId()] = { targetHours: 36, dailyHours: 2, weekendsOff: 2 };
    const settings = state.settings[periodId()];
    settings.dailyHours = Math.max(0.5, Math.min(2, Number(settings.dailyHours) || 2));
    return settings;
  }
  function getPeriodRange() {
    return {
      start: makeDate(state.periodYear, state.periodMonth - 1, 24),
      end: makeDate(state.periodYear, state.periodMonth, 23),
    };
  }
  function movePeriod(offset) {
    const next = makeDate(state.periodYear, state.periodMonth + offset, 1);
    state.periodYear = next.getFullYear();
    state.periodMonth = next.getMonth() + 1;
    renderAll();
  }
  function getCalendarDays(start, end) {
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const gridEnd = new Date(end);
    gridEnd.setDate(end.getDate() + ((7 - end.getDay()) % 7));
    const days = [], cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
  function getWeekendGroups(start, end) {
    const groups = [], cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getDay() === 6) {
        const sunday = new Date(cursor); sunday.setDate(cursor.getDate() + 1);
        if (sunday <= end) {
          const keys = [dateKey(cursor), dateKey(sunday)];
          if (keys.every((key) => holidayData[key]?.type !== 'workday')) groups.push(keys);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return groups;
  }
  function isInside(date, start, end) { return date >= start && date <= end; }

  function calculatePlan(range, settings) {
    const allPeriodDays = [];
    const cursor = new Date(range.start);
    while (cursor <= range.end) { allPeriodDays.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }

    const actualTotal = allPeriodDays.reduce((sum, date) => date.getDay() === 5 ? sum : sum + (Number(state.actual[dateKey(date)]) || 0), 0);
    const fridayExtra = allPeriodDays.reduce((sum, date) => date.getDay() === 5 ? sum + (Number(state.actual[dateKey(date)]) || 0) : sum, 0);
    const weekendGroups = getWeekendGroups(range.start, range.end);
    settings.weekendsOff = Math.min(settings.weekendsOff, weekendGroups.length);
    const reservable = weekendGroups.filter((group) => group.every((key) => (state.actual[key] || 0) === 0));
    const reserved = new Set(reservable.slice(0, settings.weekendsOff).flat());
    const remaining = Math.max(0, settings.targetHours - actualTotal);
    const suggestions = {};

    if (remaining > 0) {
      const todayKey = dateKey(today);
      const workdays = [];
      const restDays = [];

      allPeriodDays.forEach((date) => {
        const key = dateKey(date), info = holidayData[key];
        if (key < todayKey || date.getDay() === 5 || date.getDay() === 0 || (state.actual[key] || 0) > 0) return;
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        if (reserved.has(key) && info?.type !== 'workday') return;
        const normalWorkday = info?.type === 'workday' || (!weekend && info?.type !== 'holiday');
        (normalWorkday ? workdays : restDays).push(date);
      });

      let left = Math.round(remaining * 2) / 2;
      const dailyHours = Math.max(0.5, Math.min(2, Number(settings.dailyHours) || 2));

      workdays.forEach((date) => {
        if (left <= 0) return;
        const amount = Math.min(dailyHours, left);
        suggestions[dateKey(date)] = Math.round(amount * 2) / 2;
        left = Math.round((left - amount) * 2) / 2;
      });

      workdays.forEach((date) => {
        if (left <= 0) return;
        const key = dateKey(date);
        const capacity = 2 - (suggestions[key] || 0);
        const amount = Math.min(capacity, left);
        if (amount > 0) suggestions[key] = Math.round(((suggestions[key] || 0) + amount) * 2) / 2;
        left = Math.round((left - amount) * 2) / 2;
      });

      const restSlots = Math.min(restDays.length, Math.floor(left / 5));
      if (restSlots > 0) {
        let restTotal = Math.min(left, restSlots * 8);
        restDays.slice(0, restSlots).forEach((date, index) => {
          const slotsLeft = restSlots - index;
          const amount = Math.min(8, restTotal - 5 * (slotsLeft - 1));
          suggestions[dateKey(date)] = Math.round(amount * 2) / 2;
          restTotal = Math.round((restTotal - amount) * 2) / 2;
          left = Math.round((left - amount) * 2) / 2;
        });
      }
    }
    return { actualTotal, fridayExtra, remaining, suggestions, reserved, weekendGroups };
  }

  const elements = {
    periodLabel: document.getElementById('period-label'), calendarTitle: document.getElementById('calendar-title'), periodRange: document.getElementById('period-range'),
    target: document.getElementById('target-hours'), dailyHours: document.getElementById('daily-hours'), weekendsOff: document.getElementById('weekends-off'), weekendHelp: document.getElementById('weekend-help'),
    actualTotal: document.getElementById('actual-total'), fridayExtra: document.getElementById('friday-extra'), remainingTotal: document.getElementById('remaining-total'), progressPercent: document.getElementById('progress-percent'),
    progressTrack: document.querySelector('#progress-track span'), arrangedDays: document.getElementById('arranged-days'), coverageHours: document.getElementById('coverage-hours'),
    suggestedTotal: document.getElementById('suggested-total'), calendarGrid: document.getElementById('calendar-grid'), toast: document.getElementById('toast'),
    sidebar: document.getElementById('sidebar'), backdrop: document.getElementById('sidebar-backdrop'), mobileSummary: document.getElementById('mobile-settings-summary'), toastMessage: document.getElementById('toast-message'),
    importButton: document.getElementById('import-button'), exportButton: document.getElementById('export-button'), importFile: document.getElementById('import-file'),
  };

  function renderAll() {
    const settings = getSettings(), range = getPeriodRange(), plan = calculatePlan(range, settings);
    const label = `${state.periodYear}年${state.periodMonth}月考核周期`;
    const rangeText = `${range.start.getFullYear()}年${range.start.getMonth() + 1}月24日 — ${range.end.getFullYear()}年${range.end.getMonth() + 1}月23日`;
    elements.periodLabel.textContent = label;
    elements.calendarTitle.textContent = label;
    elements.periodRange.textContent = rangeText;
    elements.target.value = settings.targetHours;
    elements.dailyHours.value = settings.dailyHours;
    elements.weekendsOff.max = plan.weekendGroups.length;
    elements.weekendsOff.value = settings.weekendsOff;
    elements.weekendHelp.textContent = `本周期最多可保留 ${plan.weekendGroups.length} 个完整周末`;
    elements.mobileSummary.textContent = `${formatHours(settings.targetHours)}h · 每天 ${formatHours(settings.dailyHours)}h`;

    const progress = settings.targetHours > 0 ? Math.min(100, Math.round(plan.actualTotal / settings.targetHours * 100)) : 0;
    const coverage = Object.values(plan.suggestions).reduce((sum, value) => sum + value, 0);
    elements.actualTotal.textContent = `${formatHours(plan.actualTotal)}h`;
    elements.remainingTotal.textContent = `${formatHours(plan.remaining)}h`;
    elements.fridayExtra.textContent = `${formatHours(plan.fridayExtra)}h`;
    elements.progressPercent.textContent = `${progress}%`;
    elements.progressPercent.classList.toggle('complete', plan.remaining === 0);
    elements.progressTrack.style.width = `${progress}%`;
    elements.arrangedDays.textContent = `剩余 ${Object.keys(plan.suggestions).length} 个可安排日期`;
    elements.coverageHours.textContent = `当前计划可覆盖 ${formatHours(coverage)} 小时`;
    elements.suggestedTotal.textContent = `${formatHours(coverage)}h`;
    renderCalendar(range, plan);
    saveState();
  }

  function renderCalendar(range, plan) {
    const days = getCalendarDays(range.start, range.end);
    elements.calendarGrid.innerHTML = days.map((date) => {
      const key = dateKey(date), inside = isInside(date, range.start, range.end), info = holidayData[key];
      const weekend = date.getDay() === 0 || date.getDay() === 6, isToday = key === dateKey(today), value = Number(state.actual[key]) || 0, suggestion = plan.suggestions[key] || 0;
      const monthName = date.getDate() === 1 || key === dateKey(range.start) ? `<span class="month-name">${date.getMonth() + 1}月</span>` : '';
      const holidayTag = info ? `<span class="holiday-tag ${info.type}">${info.type === 'workday' ? '班' : '休'} · ${info.name}</span>` : '';
      const offTag = inside && plan.reserved.has(key) && info?.type !== 'workday' && !info ? '<span class="off-tag">完整双休</span>' : '';
      const isFriday = date.getDay() === 5;
      const planTag = value > 0 ? `<span class="${isFriday ? 'extra-tag' : 'done-tag'}">${isFriday ? '额外 +' : '✓ 已加班 '}${formatHours(value)}h</span>` : suggestion > 0 ? `<span class="suggestion-tag">建议 ${formatHours(suggestion)}h</span>` : '';
      return `<article class="day-cell ${inside ? '' : 'outside'} ${weekend ? 'weekend' : ''} ${isFriday ? 'friday' : ''} ${info?.type || ''} ${isToday ? 'today' : ''}">
        <div class="day-top"><span class="date-number">${date.getDate()}</span>${monthName}${isToday ? '<span class="today-badge">今天</span>' : ''}</div>
        <div class="day-flags">${inside ? holidayTag + offTag + planTag : ''}</div>
        ${inside ? `<label class="actual-input"><span>${isFriday ? '额外' : '实际'}</span><input data-date="${key}" aria-label="${key} ${isFriday ? '额外' : '实际'}加班小时" type="number" min="0" max="24" step="0.5" value="${value || ''}" placeholder="0"><i>h</i></label>` : ''}
      </article>`;
    }).join('');
  }

  let toastTimer;
  function notify(message = '已根据实际加班自动调整剩余计划') {
    elements.toastMessage.textContent = message;
    clearTimeout(toastTimer); elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2200);
  }
  function closeSettings() {
    elements.sidebar.classList.remove('open'); elements.backdrop.classList.remove('show');
    document.getElementById('mobile-settings-button').setAttribute('aria-expanded', 'false');
    document.getElementById('mobile-settings-action').textContent = '调整';
  }

  document.getElementById('prev-period').addEventListener('click', () => movePeriod(-1));
  document.getElementById('next-period').addEventListener('click', () => movePeriod(1));
  document.getElementById('today-button').addEventListener('click', () => { const current = currentPeriodEnd(); state.periodYear = current.year; state.periodMonth = current.month; renderAll(); });
  elements.target.addEventListener('input', (event) => { getSettings().targetHours = Math.max(0, Number(event.target.value) || 0); renderAll(); });
  elements.dailyHours.addEventListener('change', (event) => { getSettings().dailyHours = Math.max(0.5, Math.min(2, Number(event.target.value) || 2)); renderAll(); });
  elements.weekendsOff.addEventListener('input', (event) => { getSettings().weekendsOff = Math.max(0, Math.min(Number(event.target.max), Number(event.target.value) || 0)); renderAll(); });
  elements.calendarGrid.addEventListener('change', (event) => {
    const input = event.target.closest('[data-date]'); if (!input) return;
    state.actual[input.dataset.date] = Math.round(Math.max(0, Math.min(24, Number(input.value) || 0)) * 2) / 2;
    renderAll(); notify();
  });
  elements.calendarGrid.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('[data-date]')) event.target.blur(); });
  document.getElementById('reset-button').addEventListener('click', () => {
    const range = getPeriodRange(); Object.keys(state.actual).forEach((key) => { const date = makeDate(Number(key.slice(0, 4)), Number(key.slice(5, 7)), Number(key.slice(8, 10))); if (isInside(date, range.start, range.end)) delete state.actual[key]; });
    renderAll(); notify();
  });
  ['redistribute-button', 'allocate-button'].forEach((id) => document.getElementById(id).addEventListener('click', () => { closeSettings(); renderAll(); notify(); }));
  document.getElementById('mobile-settings-button').addEventListener('click', () => {
    const open = !elements.sidebar.classList.contains('open'); elements.sidebar.classList.toggle('open', open); elements.backdrop.classList.toggle('show', open);
    document.getElementById('mobile-settings-button').setAttribute('aria-expanded', String(open)); document.getElementById('mobile-settings-action').textContent = open ? '收起' : '调整';
  });
  elements.backdrop.addEventListener('click', closeSettings);

  elements.exportButton.addEventListener('click', () => {
    const blob = new Blob([`${JSON.stringify(stateSnapshot(), null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `加班时间安排-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!applySavedState(imported)) throw new Error('JSON 格式不正确');
      saveState();
      renderAll();
      notify('已导入 JSON 数据');
    } catch (error) {
      window.alert(`导入失败：${error.message}`);
    }
  });

  function start() {
    loadBrowserState();
    renderAll();
  }

  start();
})();
