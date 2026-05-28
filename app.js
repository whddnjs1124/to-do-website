'use strict';

// ─── State ───────────────────────────────────────────────
let todos      = JSON.parse(localStorage.getItem('todos') || '[]');
let activeDay  = 'all';  // 'all' | 0-6
let activeDate = null;   // null | 'YYYY-MM-DD'
let draggingId = null;
let calYear    = new Date().getFullYear();
let calMonth   = new Date().getMonth(); // 0-based

// ─── DOM refs ────────────────────────────────────────────
const input      = document.getElementById('todoInput');
const addBtn     = document.getElementById('addBtn');
const list       = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const footer     = document.getElementById('footer');
const leftCount  = document.getElementById('leftCount');
const clearBtn   = document.getElementById('clearBtn');
const dayBtns    = document.querySelectorAll('.day-btn');
const dateEl     = document.getElementById('currentDate');
const subtitleEl = document.getElementById('taskCount');
const calEl      = document.getElementById('calendar');

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
  };
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

  li.innerHTML = `
    <span class="drag-handle">⠿</span>
    <label class="check-wrapper" for="${checkId}">
      <input type="checkbox" id="${checkId}" ${done ? 'checked' : ''} ${isIncomplete ? 'disabled' : ''} />
      <span class="checkmark"></span>
    </label>
    <span class="todo-text">${escapeHtml(todo.text)}</span>
    ${dateTag}
    ${incompleteTag}
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

  list.innerHTML = '';
  const groups = sortedGroups(items);
  if (groups.length > 1) {
    groups.forEach(({ dateStr, todos: groupTodos }) => {
      list.appendChild(buildGroupHeader(dateStr));
      groupTodos.forEach(todo => list.appendChild(buildItem(todo)));
    });
  } else {
    items.forEach(todo => list.appendChild(buildItem(todo)));
  }

  const activeCount    = items.filter(t => !isDone(t)).length;
  const completedCount = items.filter(t => isDone(t) && !t.recurring).length;
  const hasAny         = todos.length > 0;

  emptyState.classList.toggle('visible', items.length === 0);

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
  todos.unshift({ id: Date.now(), text, done: false, date: date || null, day: day ?? null, recurring: null, lastDoneDate: null });
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
