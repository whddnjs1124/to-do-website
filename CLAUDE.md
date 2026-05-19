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
- `date`: `null` | `'YYYY-MM-DD'` — set by clicking a calendar date
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
