# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page, plain-HTML/CSS/JS todo list app with no build step, no dependencies, and no framework. Open `index.html` directly in a browser — that's the entire dev workflow.

## Architecture

Three files, each with a single responsibility:

- **[index.html](index.html)** — static markup only; no inline scripts or styles. All IDs referenced in JS are declared here.
- **[style.css](style.css)** — dark-theme design system via CSS custom properties on `:root` (`--bg`, `--surface`, `--accent`, etc.). Visibility toggling is done by adding/removing `.visible` class rather than setting `display` directly in JS.
- **[app.js](app.js)** — all application logic. Runs in `'use strict'` mode. State is persisted to `localStorage` under the key `'todos'`. Every mutation calls `save()` then `render()`. `render()` does a full DOM rebuild of the list and then calls `renderCalendar()`.

## Data Model

Each todo object: `{ id, text, done, day, date, recurring, lastDoneDate, startTime, endTime }`

- `day`: `null` | `0–6` (day of week, 0 = 일, 1 = 월 … 6 = 토) — set by the day tab bar or derived from `date`
- `date`: `null` | `'YYYY-MM-DD'` — set by clicking a calendar date or via voice input
- `recurring`: `null` | `'weekly'` — makes the todo repeat every week on its assigned `day`
- `lastDoneDate`: `null` | `'YYYY-MM-DD'` — used instead of `done` for recurring todos; records the last date it was checked
- `startTime`: `null` | `'HH:MM'` — 24-hour format start time for planner view
- `endTime`: `null` | `'HH:MM'` — 24-hour format end time for planner view
- When a calendar date is selected, both `date` and `day` are populated together (day is derived from the date)

## Filtering Logic (`filtered()`)

Priority order — only one filter is active at a time:
1. `activeDate` is set → show todos where `t.date === activeDate`, **plus** recurring todos whose `t.day` matches the date's weekday (only for future/today dates)
2. `activeDay !== 'all'` → show todos where `t.day === activeDay`
3. Otherwise → show all todos

## Key Patterns

**State mutations always follow this sequence:** mutate `todos` → `save()` → `render()`.

**`isDone(todo)`** — use this instead of `todo.done` directly. For recurring todos it checks `todo.lastDoneDate === getTodayStr()`; for regular todos it checks `todo.done`.

**`isPastIncomplete(todo)`** — returns `true` when `todo.date` is before today AND `todo.done === false` AND `todo.recurring` is falsy. Recurring todos are never past-incomplete.

**Calendar + day tab sync:** clicking a calendar date sets both `activeDate` and `activeDay` (to the day of week of that date) and highlights the corresponding day tab. Clicking a day tab clears `activeDate` and shows all todos for that weekday. These two states are mutually exclusive — always clear one when setting the other.

**`render()` calls `renderCalendar()`** at the end to keep calendar dots in sync with the todo list. Don't call `renderCalendar()` separately after `render()` — it's redundant.

**Delete animation:** `deleteTodo` adds `.removing` CSS class first, then removes the item from `todos` only after the `animationend` event fires — don't bypass this when adding delete logic. `clearCompleted` follows the same pattern and collects IDs upfront before animation.

**Inline edit:** double-clicking `.todo-text` replaces it with an `<input>` in-place. The blur listener is explicitly removed before calling commit on Enter/Escape to prevent a double-commit.

**Drag & drop:** reordering operates on indices in the master `todos` array (not the filtered view) using `findIndex` by ID. This keeps order correct regardless of which filter is active.

**XSS:** all user-supplied text is routed through `escapeHtml()` before being placed in `innerHTML`. Maintain this for any new rendering paths.

**Todo IDs** are `Date.now()` timestamps — unique enough for a single-user local app.

**Subtitle and footer** visibility are driven entirely inside `render()` based on counts — don't add separate update calls elsewhere.

**Delete button visibility:** the `.delete-btn` is hidden by default (`opacity: 0; pointer-events: none`) and only becomes visible (via CSS) when the item has `.done` or `.incomplete` class. It does NOT show on hover for normal active items — this is intentional to prevent accidental deletion.

## View Toggle (리스트 / 플래너)

`viewMode` state: `'list'` | `'planner'`. Toggle buttons live in `.view-toggle` below the day bar.

In `render()`, when `viewMode === 'planner'`:
- `#todoList` is hidden via `style.display = 'none'`
- `#plannerView` gets `.visible` class and `renderPlanner(items)` is called
- `emptyState` is never shown in planner mode

## Group Headers (List View)

**전체 탭:** uses `sortedGroupsAll(items)` which returns groups in order: date-specific todos (sorted ascending by date) → day-of-week todos (월→화→수→목→금→토→일) → "요일 미지정". Each group type gets a different header: `buildGroupHeader(dateStr)` for date groups, `buildDayGroupHeader(key)` for day/none groups.

**Other tabs / date filter:** uses `sortedGroups(items)` grouped by `t.date`. Headers shown only when `groups.length > 1`. Null-date group shows "날짜 미지정".

## Planner View

**Constants:** `HOUR_HEIGHT = 60` (px per hour, scale: 1px = 1 minute), `PLANNER_START = 0`, `PLANNER_END = 23`.

**Single day view** (day tab or date selected):
- `renderPlanner(items)` splits items into `unassigned` (no `startTime`) and `scheduled` (has `startTime`)
- Unassigned shown as chips at top
- Full 00:00–23:00 time grid via `buildPlannerGrid(scheduled, 0, 23, showNow)`
- Hour labels shown every 1 hour (60px rows are readable)

**전체 tab:**
- Groups scheduled items by `day`
- Each day with scheduled items gets a compressed timeline (startH = min hour - 1, endH = max endTime hour + 1)
- Today's day section highlighted with `pl-day-today` class

**Event card positioning:**
- `top = (sh - startH) * HOUR_HEIGHT + sm` px (sm = minutes, 1px = 1min)
- `height = Math.max(24, dur)` px where `dur` is duration in minutes

**Now-line:** shown when viewing today's day or today's date. Positioned at `(nh - startH) * HOUR_HEIGHT + nm` px.

## Recurring Todos

`recurring: 'weekly'` makes a todo repeat every week on its `day`.

**Toggle:** the repeat SVG button (`.recurring-btn`) on each todo item toggles `recurring` between `null` and `'weekly'`. When turning off, `lastDoneDate` is also cleared.

**Done state:** recurring todos use `lastDoneDate` instead of `done`. `isDone(t)` returns `t.lastDoneDate === getTodayStr()` for recurring. `toggleTodo` sets `lastDoneDate` to today (or clears it) for recurring todos.

**clearCompleted:** recurring todos are excluded — they are never deleted by bulk-clear. Only non-recurring completed todos are removed.

**Calendar dots:** `renderCalendar()` computes `recurringDays` (set of weekday numbers with `recurring` todos) and places a purple `.cal-recurring-dot` on all future dates matching those weekdays. Regular todo dots remain pink (`.cal-dot`).

## Time Picker (startTime / endTime)

Each todo item has a time tag (clock SVG icon when unset, `HH:MM–HH:MM` badge when set). Clicking opens an inline popup with:
- Two `<select>` rows: hours (00–23) and minutes (00, 05, 10 ... 55) for start and end times
- 저장 saves both times; 삭제 clears them to null
- Opening the picker dims all other list items (`.time-dimmed` class) so the popup is readable

The picker popup is `position: absolute` on the `.todo-item` (which has `position: relative`) with `z-index: 10` when `.time-editing` is active.

**`timeSelectsHtml(timeStr, hClass, mClass)`** generates the hour+minute select HTML. If `timeStr` is set, it pre-selects the matching values (minute rounded to nearest 5).

## Past-Incomplete Todos

`isPastIncomplete(todo)` returns `true` when `todo.date` is before today **and** `todo.done === false` **and** `!todo.recurring`.

**Behaviour in `buildItem()`:**
- Adds `.incomplete` class to the `<li>`.
- Renders a `<span class="incomplete-tag">미완료</span>` badge next to the date tag.
- The checkbox `<input>` receives the `disabled` attribute — the item cannot be toggled to done.
- The delete button remains fully functional.

**CSS:** `.todo-item.incomplete` uses a red-tinted border/background. `.todo-item.incomplete .check-wrapper` has `opacity: 0.25` and `pointer-events: none`.

## Voice Input

Mic button (`#voiceBtn`) in the input area triggers browser speech recognition (Web Speech API, `ko-KR`). **No external API — fully client-side.**

**Flow:** click → `SpeechRecognition` starts → user speaks → `onresult` fires → `parseVoiceInput(transcript)` → `applyVoiceTodo(parsed)`.

### `parseVoiceInput(transcript)` — Korean date parser

Extracts date/day from the transcript in priority order:

| Pattern | Example | Result |
|---|---|---|
| `N월 N일` | "5월 20일 졸업식" | `date: '2026-05-20'` |
| `오늘` | "오늘 병원" | `date: today` |
| `내일` | "내일 보고서" | `date: tomorrow` |
| `모레` | "모레 모임" | `date: day after tomorrow` |
| `N요일` | "월요일 회의" | `day: 1` |
| (없음) | "장보기" | `date: today` (기본값) |

After extracting date/day, removes the matched expression from the text, then strips common Korean sentence endings.

### `applyVoiceTodo({ text, date, day })`

Directly pushes to `todos` with `recurring: null, lastDoneDate: null, startTime: null, endTime: null` (does not use `createTodo()` — avoids touching `activeDate`/`activeDay` filter state).

### Voice UI states

- **recording**: `.voice-btn.recording` — pink pulse animation, status shows "듣는 중..."
- **idle**: default state, status hidden
- `voiceState` guard prevents double-start.
- Chrome only (Web Speech API).
