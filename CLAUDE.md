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

Each todo object: `{ id, text, done, day, date }`

- `day`: `null` | `0–6` (day of week, 0 = 일, 1 = 월 … 6 = 토) — set by the day tab bar or derived from `date`
- `date`: `null` | `'YYYY-MM-DD'` — set by clicking a calendar date or via voice input
- When a calendar date is selected, both `date` and `day` are populated together (day is derived from the date)

## Filtering Logic (`filtered()`)

Priority order — only one filter is active at a time:
1. `activeDate` is set → show todos where `t.date === activeDate`
2. `activeDay !== 'all'` → show todos where `t.day === activeDay`
3. Otherwise → show all todos

## Key Patterns

**State mutations always follow this sequence:** mutate `todos` → `save()` → `render()`.

**Calendar + day tab sync:** clicking a calendar date sets both `activeDate` and `activeDay` (to the day of week of that date) and highlights the corresponding day tab. Clicking a day tab clears `activeDate` and shows all todos for that weekday. These two states are mutually exclusive — always clear one when setting the other.

**`render()` calls `renderCalendar()`** at the end to keep calendar dots in sync with the todo list. Don't call `renderCalendar()` separately after `render()` — it's redundant.

**Delete animation:** `deleteTodo` adds `.removing` CSS class first, then removes the item from `todos` only after the `animationend` event fires — don't bypass this when adding delete logic. `clearCompleted` follows the same pattern and uses the rendered DOM to determine which IDs to remove.

**Inline edit:** double-clicking `.todo-text` replaces it with an `<input>` in-place. The blur listener is explicitly removed before calling commit on Enter/Escape to prevent a double-commit.

**Drag & drop:** reordering operates on indices in the master `todos` array (not the filtered view) using `findIndex` by ID. This keeps order correct regardless of which filter is active.

**XSS:** all user-supplied text is routed through `escapeHtml()` before being placed in `innerHTML`. Maintain this for any new rendering paths.

**Todo IDs** are `Date.now()` timestamps — unique enough for a single-user local app.

**Subtitle and footer** visibility are driven entirely inside `render()` based on counts — don't add separate update calls elsewhere.

## Date Group Headers

When the filtered view contains todos with **2개 이상의 서로 다른 날짜**, `render()` inserts `<li class="group-header">` separators between groups.

- `sortedGroups(items)` — groups `items` by `todo.date`, sorts groups ascending by date (null group last), returns `[{ dateStr, todos }]`.
- `buildGroupHeader(dateStr)` — returns a `<li class="group-header">` element. Today's group gets class `group-today` and displays "오늘 · M월 D일 (요일)". Null group shows "날짜 미지정".
- Group headers are shown only when `groups.length > 1`. Single-group views render without headers.
- This applies to all views: specific day tab, 전체, and date-selected views.

## Past-Incomplete Todos

`isPastIncomplete(todo)` returns `true` when `todo.date` is before today **and** `todo.done === false`. Todos with no `date` (date-less or day-only) are never considered past-incomplete.

**Behaviour in `buildItem()`:**
- Adds `.incomplete` class to the `<li>`.
- Renders a `<span class="incomplete-tag">미완료</span>` badge next to the date tag.
- The checkbox `<input>` receives the `disabled` attribute — the item cannot be toggled to done.
- The delete button remains fully functional; users may also choose to leave the item as-is.

**CSS:** `.todo-item.incomplete` uses a red-tinted border/background. `.todo-item.incomplete .check-wrapper` has `opacity: 0.25` and `pointer-events: none`. `.incomplete-tag` is a small red pill badge.

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

After extracting date/day, removes the matched expression from the text, then strips common Korean sentence endings (`이다/야/이에요/할게/함/있어/있다` 등).

### `applyVoiceTodo({ text, date, day })`

Directly pushes `{ id: Date.now(), text, done: false, date, day }` to `todos` (does not use `createTodo()` — avoids touching `activeDate`/`activeDay` filter state). Calls `save()` then `render()`.

### Voice UI states

- **recording**: `.voice-btn.recording` — pink pulse animation, status shows "듣는 중..."
- **idle**: default state, status hidden
- `voiceState` guard prevents double-start.
- Chrome only (Web Speech API).
