'use strict';

// ─── State ───────────────────────────────────────────────
let todos      = JSON.parse(localStorage.getItem('todos') || '[]');
let activeDay  = 'all';  // 'all' | 0-6
let activeDate = null;   // null | 'YYYY-MM-DD'
let draggingId = null;
let calYear    = new Date().getFullYear();
let calMonth   = new Date().getMonth(); // 0-based
let viewMode   = 'list'; // 'list' | 'planner'

// ─── DOM refs ────────────────────────────────────────────
const input      = document.getElementById('todoInput');
const addBtn     = document.getElementById('addBtn');
const list       = document.getElementById('todoList');
const plannerEl  = document.getElementById('plannerView');
const emptyState = document.getElementById('emptyState');
const footer     = document.getElementById('footer');
const leftCount  = document.getElementById('leftCount');
const clearBtn   = document.getElementById('clearBtn');
const dayBtns    = document.querySelectorAll('.day-btn');
const viewBtns   = document.querySelectorAll('.view-btn');
const dateEl     = document.getElementById('currentDate');
const subtitleEl = document.getElementById('taskCount');
const calEl      = document.getElementById('calendar');

// ─── Planner constants ────────────────────────────────────
const HOUR_HEIGHT   = 60; // px per hour (1px = 1 min)
const PLANNER_START = 0;
const PLANNER_END   = 23;

// ─── Date display & today highlight ──────────────────────
(function setDate() {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  document.querySelector(`.day-btn[data-day="${now.getDay()}"]`)?.classList.add('today');
})();

// ─── Helpers ─────────────────────────────────────────────
function save() {
  localStorage.setItem('todos', JSON.stringify(todos));
}

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

function getTodayStr() {
  const now = new Date();
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
}

function isDone(todo) {
  return todo.recurring ? todo.lastDoneDate === getTodayStr() : todo.done;
}

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// ─── XSS guard ───────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── Create todo ─────────────────────────────────────────
function createTodo(text) {
  return {
    id:           Date.now(),
    text:         text.trim(),
    done:         false,
    date:         activeDate || null,
    day:          activeDate ? parseDateStr(activeDate).dow : (activeDay === 'all' ? null : activeDay),
    recurring:    null,
    lastDoneDate: null,
    startTime:    null,
    endTime:      null,
  };
}

// ─── Time select HTML generator ──────────────────────────
function timeSelectsHtml(timeStr, hClass, mClass) {
  const h = timeStr ? parseInt(timeStr.split(':')[0], 10) : 0;
  const m = timeStr ? Math.round(parseInt(timeStr.split(':')[1], 10) / 5) * 5 % 60 : 0;
  const hourOpts = Array.from({ length: 24 }, (_, i) =>
    `<option value="${i}"${i === h ? ' selected' : ''}>${String(i).padStart(2, '0')}</option>`
  ).join('');
  const minOpts = [0,5,10,15,20,25,30,35,40,45,50,55].map(min =>
    `<option value="${min}"${min === m ? ' selected' : ''}>${String(min).padStart(2, '0')}</option>`
  ).join('');
  return `<select class="time-select ${hClass}">${hourOpts}</select><span class="time-colon">:</span><select class="time-select ${mClass}">${minOpts}</select>`;
}

// ─── Past-incomplete check ────────────────────────────────
function isPastIncomplete(todo) {
  if (!todo.date || todo.done || todo.recurring) return false;
  return todo.date < getTodayStr();
}

// ─── Add ─────────────────────────────────────────────────
function addTodo() {
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  todos.unshift(createTodo(text));
  input.value = '';
  save();
  render();
  input.focus();
}

// ─── Toggle ──────────────────────────────────────────────
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  if (todo.recurring) {
    const today = getTodayStr();
    todo.lastDoneDate = todo.lastDoneDate === today ? null : today;
  } else {
    todo.done = !todo.done;
  }
  save();
  render();
}

// ─── Toggle recurring ────────────────────────────────────
function toggleRecurring(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  todo.recurring = todo.recurring ? null : 'weekly';
  if (!todo.recurring) todo.lastDoneDate = null;
  save();
  render();
}

// ─── Delete ──────────────────────────────────────────────
function deleteTodo(id, itemEl) {
  itemEl.classList.add('removing');
  itemEl.addEventListener('animationend', () => {
    todos = todos.filter(t => t.id !== id);
    save();
    render();
  }, { once: true });
}

// ─── Clear completed ─────────────────────────────────────
function clearCompleted() {
  const toRemove = [...list.querySelectorAll('.todo-item.done')].filter(el => {
    const todo = todos.find(t => t.id === Number(el.dataset.id));
    return todo && !todo.recurring;
  });
  if (!toRemove.length) return;
  const removeIds = new Set(toRemove.map(el => Number(el.dataset.id)));
  let pending = toRemove.length;
  toRemove.forEach(el => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => {
      if (--pending === 0) {
        todos = todos.filter(t => !removeIds.has(t.id));
        save();
        render();
      }
    }, { once: true });
  });
}

// ─── Filtered view ───────────────────────────────────────
function filtered() {
  if (activeDate) {
    const dow = parseDateStr(activeDate).dow;
    return todos.filter(t =>
      t.date === activeDate ||
      (t.recurring && t.day === dow && activeDate >= getTodayStr())
    );
  }
  if (activeDay !== 'all') return todos.filter(t => t.day === activeDay);
  return todos;
}

// ─── Inline edit ─────────────────────────────────────────
function startEdit(id, textEl) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'todo-edit-input';
  inp.value = todo.text;
  textEl.replaceWith(inp);
  inp.focus();
  inp.select();

  function commit() {
    const newText = inp.value.trim();
    if (newText && newText !== todo.text) { todo.text = newText; save(); }
    render();
  }

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.removeEventListener('blur', commit); commit(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', commit); render(); }
  });
}

// ─── Build item element ──────────────────────────────────
function buildItem(todo) {
  const done        = isDone(todo);
  const isIncomplete = isPastIncomplete(todo);

  const li = document.createElement('li');
  li.className = 'todo-item' + (done ? ' done' : '') + (isIncomplete ? ' incomplete' : '');
  li.dataset.id = todo.id;
  li.draggable = true;

  const checkId = `chk-${todo.id}`;
  const hasDayAssigned = todo.day !== null && todo.day !== undefined;

  const dayOptions = `<option value="">요일</option>` +
    DAYS_KO.map((d, i) =>
      `<option value="${i}"${hasDayAssigned && todo.day === i ? ' selected' : ''}>${d}</option>`
    ).join('');

  const dateTag = todo.date
    ? (() => { const { m, d } = parseDateStr(todo.date); return `<span class="date-tag">${m}/${d}</span>`; })()
    : '';

  const incompleteTag = isIncomplete ? '<span class="incomplete-tag">미완료</span>' : '';

  const hasTime    = todo.startTime || todo.endTime;
  const timeLabel  = hasTime
    ? [todo.startTime, todo.endTime].filter(Boolean).join('–')
    : '';
  const clockSvg   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  li.innerHTML = `
    <span class="drag-handle">⠿</span>
    <label class="check-wrapper" for="${checkId}">
      <input type="checkbox" id="${checkId}" ${done ? 'checked' : ''} ${isIncomplete ? 'disabled' : ''} />
      <span class="checkmark"></span>
    </label>
    <span class="todo-text">${escapeHtml(todo.text)}</span>
    ${dateTag}
    ${incompleteTag}
    <span class="time-tag${hasTime ? ' has-time' : ''}" title="시간 설정">${hasTime ? timeLabel : clockSvg}</span>
    <div class="time-picker-popup">
      <div class="time-row">
        <label class="time-label">시작</label>
        <div class="time-selects">${timeSelectsHtml(todo.startTime, 'time-start-h', 'time-start-m')}</div>
      </div>
      <div class="time-row">
        <label class="time-label">종료</label>
        <div class="time-selects">${timeSelectsHtml(todo.endTime, 'time-end-h', 'time-end-m')}</div>
      </div>
      <div class="time-actions">
        <button class="time-save-btn">저장</button>
        <button class="time-clear-btn">삭제</button>
      </div>
    </div>
    <select class="day-select${hasDayAssigned ? ' has-day' : ''}">${dayOptions}</select>
    <button class="recurring-btn${todo.recurring ? ' is-recurring' : ''}" title="${todo.recurring ? '반복 해제' : '매주 반복'}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="17 1 21 5 17 9"/>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
    </button>
    <button class="delete-btn" title="삭제">&#x2715;</button>
  `;

  li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleTodo(todo.id));
  li.querySelector('.recurring-btn').addEventListener('click', () => toggleRecurring(todo.id));
  li.querySelector('.delete-btn').addEventListener('click', () => deleteTodo(todo.id, li));

  // ─── Time picker ──────────────────────────────────────
  li.querySelector('.time-tag').addEventListener('click', e => {
    e.stopPropagation();
    const isOpening = !li.classList.contains('time-editing');
    document.querySelectorAll('.todo-item.time-editing').forEach(el => el.classList.remove('time-editing'));
    list.querySelectorAll('.time-dimmed').forEach(el => el.classList.remove('time-dimmed'));
    if (isOpening) {
      li.classList.add('time-editing');
      list.querySelectorAll('.todo-item, .group-header').forEach(el => {
        if (el !== li) el.classList.add('time-dimmed');
      });
      setTimeout(() => {
        const outside = ev => {
          if (!li.contains(ev.target)) {
            li.classList.remove('time-editing');
            list.querySelectorAll('.time-dimmed').forEach(el => el.classList.remove('time-dimmed'));
            document.removeEventListener('click', outside);
          }
        };
        document.addEventListener('click', outside);
      }, 0);
    }
  });

  li.querySelector('.time-save-btn').addEventListener('click', e => {
    e.stopPropagation();
    const t = todos.find(x => x.id === todo.id);
    if (t) {
      const sh = String(li.querySelector('.time-start-h').value).padStart(2, '0');
      const sm = String(li.querySelector('.time-start-m').value).padStart(2, '0');
      const eh = String(li.querySelector('.time-end-h').value).padStart(2, '0');
      const em = String(li.querySelector('.time-end-m').value).padStart(2, '0');
      t.startTime = `${sh}:${sm}`;
      t.endTime   = `${eh}:${em}`;
    }
    save();
    render();
  });

  li.querySelector('.time-clear-btn').addEventListener('click', e => {
    e.stopPropagation();
    const t = todos.find(x => x.id === todo.id);
    if (t) { t.startTime = null; t.endTime = null; }
    save();
    render();
  });

  li.querySelector('.todo-text').addEventListener('dblclick', e => {
    e.stopPropagation();
    startEdit(todo.id, li.querySelector('.todo-text'));
  });

  li.querySelector('.day-select').addEventListener('change', e => {
    const t = todos.find(x => x.id === todo.id);
    if (!t) return;
    t.day = e.target.value === '' ? null : parseInt(e.target.value);
    save();
    render();
  });

  // ─── Drag & drop ──────────────────────────────────────
  li.addEventListener('dragstart', e => {
    draggingId = todo.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  li.addEventListener('dragend', () => {
    draggingId = null;
    document.querySelectorAll('.todo-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
  });

  li.addEventListener('dragover', e => {
    e.preventDefault();
    if (draggingId === todo.id) return;
    document.querySelectorAll('.todo-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  });

  li.addEventListener('drop', e => {
    e.preventDefault();
    li.classList.remove('drag-over');
    if (draggingId === null || draggingId === todo.id) return;
    const fromIdx = todos.findIndex(t => t.id === draggingId);
    const toIdx   = todos.findIndex(t => t.id === todo.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = todos.splice(fromIdx, 1);
    todos.splice(toIdx, 0, moved);
    save();
    render();
  });

  return li;
}

// ─── Group todos by date ─────────────────────────────────
function sortedGroups(items) {
  const map = new Map();
  items.forEach(t => {
    const key = t.date || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  });

  return [...map.keys()].sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return new Date(a) - new Date(b);
  }).map(k => ({ dateStr: k, todos: map.get(k) }));
}

// ─── Group todos for 전체 view (date → day → none) ───────
function sortedGroupsAll(items) {
  const dateMap = new Map();
  const dayMap  = new Map();
  const none    = [];

  items.forEach(t => {
    if (t.date) {
      if (!dateMap.has(t.date)) dateMap.set(t.date, []);
      dateMap.get(t.date).push(t);
    } else if (t.day !== null && t.day !== undefined) {
      if (!dayMap.has(t.day)) dayMap.set(t.day, []);
      dayMap.get(t.day).push(t);
    } else {
      none.push(t);
    }
  });

  const result = [];

  [...dateMap.keys()]
    .sort((a, b) => new Date(a) - new Date(b))
    .forEach(dateStr => result.push({ type: 'date', key: dateStr, todos: dateMap.get(dateStr) }));

  [1, 2, 3, 4, 5, 6, 0]
    .filter(d => dayMap.has(d))
    .forEach(day => result.push({ type: 'day', key: day, todos: dayMap.get(day) }));

  if (none.length) result.push({ type: 'none', key: null, todos: none });

  return result;
}

// ─── Day group header element ────────────────────────────
function buildDayGroupHeader(key) {
  const li = document.createElement('li');
  if (key === null) {
    li.className = 'group-header';
    li.innerHTML = '<span>요일 미지정</span>';
  } else {
    const isToday = new Date().getDay() === key;
    li.className = 'group-header' + (isToday ? ' group-today' : '');
    li.innerHTML = `<span>${DAYS_KO[key]}요일</span>`;
  }
  return li;
}

// ─── Planner grid builder ────────────────────────────────
function buildPlannerGrid(scheduled, startH, endH, showNow) {
  let hoursHtml = '';
  for (let h = startH; h <= endH; h++) {
    hoursHtml += `<div class="pl-hour"><span class="pl-hour-label">${String(h).padStart(2,'0')}:00</span></div>`;
  }

  const eventsHtml = scheduled.map(t => {
    const [sh, sm] = t.startTime.split(':').map(Number);
    if (sh < startH || sh > endH) return '';
    const top = (sh - startH) * HOUR_HEIGHT + sm;
    let height = HOUR_HEIGHT;
    if (t.endTime) {
      const [eh, em] = t.endTime.split(':').map(Number);
      const dur = (eh * 60 + em) - (sh * 60 + sm);
      if (dur > 0) height = Math.max(24, dur);
    }
    const timeStr = t.startTime + (t.endTime ? '–' + t.endTime : '');
    return `<div class="pl-event${isDone(t) ? ' pl-done' : ''}" style="top:${top}px;height:${height}px;">
      <span class="pl-event-title">${escapeHtml(t.text)}</span>
      <span class="pl-event-time">${timeStr}</span>
    </div>`;
  }).join('');

  let nowLineHtml = '';
  if (showNow) {
    const now = new Date();
    const nh = now.getHours(), nm = now.getMinutes();
    if (nh >= startH && nh <= endH) {
      const nowTop = (nh - startH) * HOUR_HEIGHT + nm;
      nowLineHtml = `<div class="pl-now-line" style="top:${nowTop}px;"></div>`;
    }
  }

  const totalH = (endH - startH + 1) * HOUR_HEIGHT;
  return `<div class="pl-grid">
    <div class="pl-hours" style="height:${totalH}px;">${hoursHtml}</div>
    <div class="pl-events" style="height:${totalH}px;">${eventsHtml}${nowLineHtml}</div>
  </div>`;
}

// ─── Planner render ──────────────────────────────────────
function renderPlanner(items) {
  const unassigned = items.filter(t => !t.startTime);
  const scheduled  = items.filter(t => !!t.startTime);
  const todayDow   = new Date().getDay();

  const unassignedHtml = unassigned.length ? `
    <div class="pl-unassigned">
      <div class="pl-section-label">미배정</div>
      <div class="pl-chips">${unassigned.map(t =>
        `<span class="pl-chip${isDone(t) ? ' pl-chip-done' : ''}">${escapeHtml(t.text)}</span>`
      ).join('')}</div>
    </div>` : '';

  if (!activeDate && activeDay === 'all') {
    const dayMap = new Map();
    scheduled.forEach(t => {
      const key = (t.day !== null && t.day !== undefined) ? t.day : 'none';
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(t);
    });

    let sectionsHtml = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      if (!dayMap.has(d)) return;
      const dayItems = dayMap.get(d);
      const hourNums = dayItems.map(t => parseInt(t.startTime.split(':')[0], 10));
      const endNums  = dayItems.map(t => t.endTime ? parseInt(t.endTime.split(':')[0], 10) : parseInt(t.startTime.split(':')[0], 10) + 1);
      const startH   = Math.max(PLANNER_START, Math.min(...hourNums) - 1);
      const endH     = Math.min(PLANNER_END,   Math.max(...endNums)  + 1);
      sectionsHtml  += `<div class="pl-day-section">
        <div class="pl-day-header${d === todayDow ? ' pl-day-today' : ''}">${DAYS_KO[d]}요일</div>
        ${buildPlannerGrid(dayItems, startH, endH, d === todayDow)}
      </div>`;
    });

    plannerEl.innerHTML = unassignedHtml +
      (sectionsHtml || '<div class="pl-empty">시간이 설정된 할 일이 없어요</div>');
  } else {
    const showNow = (!activeDate && activeDay === todayDow) || (activeDate === getTodayStr());
    plannerEl.innerHTML = unassignedHtml +
      (scheduled.length
        ? buildPlannerGrid(scheduled, PLANNER_START, PLANNER_END, showNow)
        : unassigned.length ? '' : '<div class="pl-empty">할 일이 없어요</div>');
  }
}

// ─── Group header element ─────────────────────────────────
function buildGroupHeader(dateStr) {
  const li = document.createElement('li');
  const todayStr = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  if (dateStr === null) {
    li.className = 'group-header';
    li.innerHTML = '<span>날짜 미지정</span>';
  } else {
    const { m, d, dow } = parseDateStr(dateStr);
    const isToday = dateStr === todayStr;
    li.className = 'group-header' + (isToday ? ' group-today' : '');
    const label = isToday
      ? `오늘 · ${m}월 ${d}일 (${DAYS_KO[dow]})`
      : `${m}월 ${d}일 (${DAYS_KO[dow]})`;
    li.innerHTML = `<span>${label}</span>`;
  }
  return li;
}

// ─── Calendar ────────────────────────────────────────────
function renderCalendar() {
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const now         = new Date();
  const todayStr    = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  const countMap = {};
  todos.forEach(t => { if (t.date) countMap[t.date] = (countMap[t.date] || 0) + 1; });

  const recurringDays = new Set(
    todos.filter(t => t.recurring && t.day !== null).map(t => t.day)
  );

  const dowRow     = DAYS_KO.map(d => `<span class="cal-dow">${d}</span>`).join('');
  const emptySlots = Array(firstDay).fill('<span class="cal-cell empty"></span>').join('');

  let dayCells = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = toDateStr(calYear, calMonth, d);
    const dow = new Date(calYear, calMonth, d).getDay();
    let cls   = 'cal-cell';
    if (ds === todayStr)   cls += ' cal-today';
    if (ds === activeDate) cls += ' cal-selected';
    const dot      = countMap[ds]                              ? '<span class="cal-dot"></span>'           : '';
    const recurDot = recurringDays.has(dow) && ds >= todayStr ? '<span class="cal-recurring-dot"></span>' : '';
    const dots     = (dot || recurDot) ? `<span class="cal-dots">${dot}${recurDot}</span>` : '';
    dayCells += `<button class="${cls}" data-date="${ds}">${d}${dots}</button>`;
  }

  calEl.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" id="calPrev">◀</button>
      <span class="cal-title">${calYear}년 ${calMonth + 1}월</span>
      <button class="cal-nav" id="calNext">▶</button>
    </div>
    <div class="cal-grid">
      ${dowRow}
      ${emptySlots}
      ${dayCells}
    </div>
  `;

  calEl.querySelector('#calPrev').addEventListener('click', () => {
    if (--calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  calEl.querySelector('#calNext').addEventListener('click', () => {
    if (++calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  calEl.querySelectorAll('.cal-cell[data-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ds = btn.dataset.date;
      if (activeDate === ds) {
        activeDate = null;
        activeDay  = 'all';
        dayBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('.day-btn[data-day="all"]').classList.add('active');
      } else {
        activeDate = ds;
        activeDay  = parseDateStr(ds).dow;
        dayBtns.forEach(b => b.classList.remove('active'));
        document.querySelector(`.day-btn[data-day="${activeDay}"]`).classList.add('active');
      }
      render();
    });
  });
}

// ─── Render ──────────────────────────────────────────────
function render() {
  const items = filtered();

  list.innerHTML    = '';
  plannerEl.innerHTML = '';

  if (viewMode === 'planner') {
    list.style.display = 'none';
    plannerEl.classList.add('visible');
    renderPlanner(items);
  } else {
    list.style.display = '';
    plannerEl.classList.remove('visible');
    if (!activeDate && activeDay === 'all') {
      const groups = sortedGroupsAll(items);
      if (groups.length > 1) {
        groups.forEach(({ type, key, todos: groupTodos }) => {
          list.appendChild(type === 'date' ? buildGroupHeader(key) : buildDayGroupHeader(key));
          groupTodos.forEach(todo => list.appendChild(buildItem(todo)));
        });
      } else {
        items.forEach(todo => list.appendChild(buildItem(todo)));
      }
    } else {
      const groups = sortedGroups(items);
      if (groups.length > 1) {
        groups.forEach(({ dateStr, todos: groupTodos }) => {
          list.appendChild(buildGroupHeader(dateStr));
          groupTodos.forEach(todo => list.appendChild(buildItem(todo)));
        });
      } else {
        items.forEach(todo => list.appendChild(buildItem(todo)));
      }
    }
  }

  const activeCount    = items.filter(t => !isDone(t)).length;
  const completedCount = items.filter(t => isDone(t) && !t.recurring).length;
  const hasAny         = todos.length > 0;

  emptyState.classList.toggle('visible', viewMode === 'list' && items.length === 0);

  if (hasAny) {
    footer.classList.add('visible');
    leftCount.textContent = `${activeCount}개 남음`;
    clearBtn.style.visibility = completedCount > 0 ? 'visible' : 'hidden';
  } else {
    footer.classList.remove('visible');
  }

  if (!hasAny) {
    subtitleEl.textContent = '오늘도 할 일을 정복해봐요!';
  } else if (activeDate) {
    const { m, d, dow } = parseDateStr(activeDate);
    subtitleEl.textContent = activeCount === 0
      ? `${m}월 ${d}일(${DAYS_KO[dow]}) 할 일을 모두 완료했어요!`
      : `${m}월 ${d}일(${DAYS_KO[dow]}) 할 일이 ${activeCount}개 남았어요.`;
  } else if (activeDay !== 'all') {
    subtitleEl.textContent = activeCount === 0
      ? `${DAYS_KO[activeDay]}요일 할 일을 모두 완료했어요!`
      : `${DAYS_KO[activeDay]}요일 할 일이 ${activeCount}개 남았어요.`;
  } else {
    const totalActive = todos.filter(t => !isDone(t)).length;
    subtitleEl.textContent = totalActive === 0
      ? '모든 할 일을 완료했어요!'
      : `${totalActive}개의 할 일이 남아있어요.`;
  }

  renderCalendar();
}

// ─── Day tabs ────────────────────────────────────────────
dayBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activeDay  = btn.dataset.day === 'all' ? 'all' : parseInt(btn.dataset.day);
    activeDate = null;
    dayBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// ─── View toggle ─────────────────────────────────────────
viewBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    viewMode = btn.dataset.view;
    viewBtns.forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
});

// ─── Event listeners ─────────────────────────────────────
addBtn.addEventListener('click', addTodo);
input.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
clearBtn.addEventListener('click', clearCompleted);

// ─── Voice ───────────────────────────────────────────────
const voiceBtn    = document.getElementById('voiceBtn');
const voiceStatus = document.getElementById('voiceStatus');

let voiceState = 'idle'; // 'idle' | 'recording'

function setVoiceState(state, msg) {
  voiceState = state;
  voiceBtn.classList.toggle('recording', state === 'recording');
  voiceStatus.textContent = msg || '';
  voiceStatus.classList.toggle('visible', !!msg);
}

// ─── Voice input parser ───────────────────────────────────
function parseVoiceInput(transcript) {
  const now  = new Date();
  const y    = now.getFullYear();
  let text   = transcript.trim();
  let date   = null;
  let day    = null;

  // N월 N일
  const md = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (md) {
    date = toDateStr(y, parseInt(md[1]) - 1, parseInt(md[2]));
    text = text.replace(md[0], '');
  } else if (/오늘/.test(text)) {
    date = toDateStr(y, now.getMonth(), now.getDate());
    text = text.replace(/오늘/, '');
  } else if (/내일/.test(text)) {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    date = toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
    text = text.replace(/내일/, '');
  } else if (/모레/.test(text)) {
    const t = new Date(now); t.setDate(t.getDate() + 2);
    date = toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
    text = text.replace(/모레/, '');
  } else {
    // 요일 (이번 주 / 다음 주 포함)
    const dm = text.match(/([월화수목금토일])요일/);
    if (dm) {
      day  = DAYS_KO.indexOf(dm[1]);
      text = text.replace(/(?:이번\s*주\s*|다음\s*주\s*)?[월화수목금토일]요일/, '');
    }
  }

  // 날짜/요일 모두 없으면 오늘로
  if (!date && day === null) date = toDateStr(y, now.getMonth(), now.getDate());

  // 문장 어미 제거
  text = text
    .replace(/\s*(이다|이야|야|이에요|예요|해야\s*해|해야겠어|할게|함|있어|있다|거든|거야|인데|임)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { text, date, day };
}

function applyVoiceTodo({ text, date, day }) {
  if (!text) return;
  todos.unshift({ id: Date.now(), text, done: false, date: date || null, day: day ?? null, recurring: null, lastDoneDate: null, startTime: null, endTime: null });
  save();
  render();
}

function startVoice() {
  if (voiceState !== 'idle') return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('음성 인식은 Chrome에서만 지원됩니다.'); return; }

  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart  = () => setVoiceState('recording', '듣는 중...');
  rec.onerror  = () => setVoiceState('idle', '');
  rec.onend    = () => { if (voiceState === 'recording') setVoiceState('idle', ''); };
  rec.onresult = e => {
    const transcript = e.results[0][0].transcript.trim();
    setVoiceState('idle', '');
    applyVoiceTodo(parseVoiceInput(transcript));
  };

  rec.start();
}

voiceBtn.addEventListener('click', startVoice);

// ─── Init ────────────────────────────────────────────────
render();
