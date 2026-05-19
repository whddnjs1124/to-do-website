'use strict';

// ─── API Key (default) ───────────────────────────────────
if (!localStorage.getItem('geminiApiKey')) localStorage.setItem('geminiApiKey', 'YOUR_KEY_HERE');

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
    id:   Date.now(),
    text: text.trim(),
    done: false,
    date: activeDate || null,
    day:  activeDate ? parseDateStr(activeDate).dow : (activeDay === 'all' ? null : activeDay)
  };
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
  if (todo) todo.done = !todo.done;
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
  const completed = list.querySelectorAll('.todo-item.done');
  if (!completed.length) return;
  let pending = completed.length;
  completed.forEach(el => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => {
      if (--pending === 0) {
        const visibleIds = new Set(
          [...list.querySelectorAll('.todo-item')].map(el => Number(el.dataset.id))
        );
        todos = todos.filter(t => !(t.done && visibleIds.has(t.id)));
        save();
        render();
      }
    }, { once: true });
  });
}

// ─── Filtered view ───────────────────────────────────────
function filtered() {
  if (activeDate)          return todos.filter(t => t.date === activeDate);
  if (activeDay !== 'all') return todos.filter(t => t.day  === activeDay);
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
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' done' : '');
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

  li.innerHTML = `
    <span class="drag-handle">⠿</span>
    <label class="check-wrapper" for="${checkId}">
      <input type="checkbox" id="${checkId}" ${todo.done ? 'checked' : ''} />
      <span class="checkmark"></span>
    </label>
    <span class="todo-text">${escapeHtml(todo.text)}</span>
    ${dateTag}
    <select class="day-select${hasDayAssigned ? ' has-day' : ''}">${dayOptions}</select>
    <button class="delete-btn" title="삭제">&#x2715;</button>
  `;

  li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleTodo(todo.id));
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

  const dowRow     = DAYS_KO.map(d => `<span class="cal-dow">${d}</span>`).join('');
  const emptySlots = Array(firstDay).fill('<span class="cal-cell empty"></span>').join('');

  let dayCells = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = toDateStr(calYear, calMonth, d);
    let cls   = 'cal-cell';
    if (ds === todayStr)   cls += ' cal-today';
    if (ds === activeDate) cls += ' cal-selected';
    const dot = countMap[ds] ? '<span class="cal-dot"></span>' : '';
    dayCells += `<button class="${cls}" data-date="${ds}">${d}${dot}</button>`;
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

  const activeCount    = items.filter(t => !t.done).length;
  const completedCount = items.filter(t => t.done).length;
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
    const totalActive = todos.filter(t => !t.done).length;
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
const voiceBtn      = document.getElementById('voiceBtn');
const voiceStatus   = document.getElementById('voiceStatus');
const apiKeyModal   = document.getElementById('apiKeyModal');
const apiKeyInput   = document.getElementById('apiKeyInput');
const apiKeySave    = document.getElementById('apiKeySave');
const apiKeyCancel  = document.getElementById('apiKeyCancel');

let voiceState = 'idle'; // 'idle' | 'recording' | 'processing'

function setVoiceState(state, msg) {
  voiceState = state;
  voiceBtn.classList.toggle('recording',   state === 'recording');
  voiceBtn.classList.toggle('processing',  state === 'processing');
  voiceStatus.textContent = msg || '';
  voiceStatus.classList.toggle('visible', !!msg);
}

function openApiKeyModal() {
  apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
  apiKeyModal.classList.add('visible');
  setTimeout(() => apiKeyInput.focus(), 50);
}

apiKeyModal.addEventListener('click', e => {
  if (e.target === apiKeyModal) apiKeyModal.classList.remove('visible');
});
apiKeyCancel.addEventListener('click', () => apiKeyModal.classList.remove('visible'));
apiKeySave.addEventListener('click', saveApiKey);
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKey(); });

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  localStorage.setItem('geminiApiKey', key);
  apiKeyModal.classList.remove('visible');
  startVoice();
}

async function parseWithGemini(transcript) {
  const key = localStorage.getItem('geminiApiKey');
  const today = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const prompt =
    `오늘: ${today}\n` +
    `아래 한국어 음성 입력을 Todo 항목으로 변환해줘. JSON만 반환 (설명 없이):\n` +
    `{"text":"할일 제목","date":"YYYY-MM-DD 또는 null","day":0~6 또는 null}\n\n` +
    `규칙:\n` +
    `- text: 날짜/요일 표현 제거, 문장 어미(이다/야/이에요/할게/함 등) 제거, 간결한 명사형으로\n` +
    `- date: 특정 날짜 언급 시 YYYY-MM-DD (올해 기준), 없으면 null\n` +
    `- day: 요일만 언급 시 0(일)~6(토), date가 있으면 null\n\n` +
    `입력: "${transcript}"`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0 }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || String(res.status));
  }

  const data = await res.json();
  const raw  = data.candidates[0].content.parts[0].text.trim();
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(json);
}

function applyVoiceTodo(parsed) {
  if (!parsed || !parsed.text) return;

  const date = parsed.date || null;
  const day  = date
    ? parseDateStr(date).dow
    : (parsed.day !== null && parsed.day !== undefined ? Number(parsed.day) : null);

  todos.unshift({ id: Date.now(), text: parsed.text.trim(), done: false, date, day });
  save();
  render();
}

function startVoice() {
  if (!localStorage.getItem('geminiApiKey')) { openApiKeyModal(); return; }
  if (voiceState !== 'idle') return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('음성 인식은 Chrome에서만 지원됩니다.');
    return;
  }

  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => setVoiceState('recording', '듣는 중...');
  rec.onerror = () => setVoiceState('idle', '');
  rec.onend   = () => { if (voiceState === 'recording') setVoiceState('idle', ''); };

  rec.onresult = async e => {
    const transcript = e.results[0][0].transcript.trim();
    setVoiceState('processing', `"${transcript}" 분석 중...`);
    try {
      const parsed = await parseWithGemini(transcript);
      applyVoiceTodo(parsed);
    } catch (err) {
      if (/400|403|API_KEY_INVALID|invalid.*key|key.*invalid/i.test(err.message)) {
        localStorage.removeItem('geminiApiKey');
        openApiKeyModal();
      }
    } finally {
      setVoiceState('idle', '');
    }
  };

  rec.start();
}

voiceBtn.addEventListener('click', startVoice);
voiceBtn.addEventListener('contextmenu', e => { e.preventDefault(); openApiKeyModal(); });

// ─── Init ────────────────────────────────────────────────
render();
