# i18n Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add internationalization infrastructure so UI strings are stored in locale files and rendered through a React context, starting with English and leaving the door open for additional languages.

**Architecture:** A minimal `I18nProvider` React context wraps the app root and makes a `t(key, params?)` function available everywhere. An English locale file (`en.json`) holds all translatable strings as a flat JSON dictionary with namespaced keys (e.g. `"cmsView.welcome"`). Components import `useT()` to get the translate function. Strings are migrated incrementally — this plan covers the core app (App.jsx, LeftRail, WelcomeScreen, GitChip, CmsPanel, CmsView, PagesPanel, PropsPanel, StructurePanel) plus shared UI components. The style-panel (~400-600 strings) is left for a follow-up plan.

**Tech Stack:** React 18 context + hooks, no external dependencies (no i18next, no formatjs). Locale files are plain JSON.

---

## File Structure

| Action | File | Role |
|--------|------|------|
| Create | `src/i18n/I18nContext.jsx` | React context, `I18nProvider`, `useT` hook |
| Create | `src/i18n/en.json` | English locale — namespaced key → value dictionary |
| Modify | `src/main.jsx` | Wrap `<App />` with `<I18nProvider>` |
| Modify | `src/App.jsx` | Replace hardcoded strings with `t()` calls |
| Modify | `src/panels/WelcomeScreen.jsx` | Replace strings |
| Modify | `src/panels/LeftRail.jsx` (in ui/) | Replace strings |
| Modify | `src/panels/GitChip.jsx` | Replace strings |
| Modify | `src/panels/CmsPanel.jsx` | Replace strings |
| Modify | `src/panels/CmsView.jsx` | Replace strings (partial — heading/tooltip strings only, not user-data labels) |
| Modify | `src/panels/PagesPanel.jsx` | Replace strings |
| Modify | `src/panels/PropsPanel.jsx` | Replace strings |
| Modify | `src/panels/StructurePanel.jsx` | Replace strings |
| Modify | `src/ui/LeftRail.jsx` | Replace strings |
| Modify | `src/ui/InsertSearch.jsx` | Replace strings |
| Modify | `src/ui/CodeWindow.jsx` | Replace strings |

Total: ~2 new files, ~14 modified files.

---

## Global Constraints

- **No breakage**: Every hardcoded string replaced by `t(key)` must produce the same English output as before. The app must look and behave identically.
- **No new dependencies**: No `i18next`, `react-intl`, `formatjs`, or similar npm packages.
- **ESLint**: No new scripts to run; if the project uses `npm run check:electron`, ensure that still passes.
- **Incremental migration**: Only core app strings are migrated in this plan. The style-panel directory is out of scope.
- **Namespaced keys**: All keys follow the pattern `<component>.<descriptor>`, e.g. `"nav.pagesPanel"`, `"cmsView.addFirstItem"`.
- **Dynamic strings**: Template literals like `` `Created ${name}.astro` `` use `t('app.createdPage', { name })` with simple `${}` placeholder replacement.

---

### Task 1: Create the i18n infrastructure

**Files:**
- Create: `src/i18n/I18nContext.jsx`
- Create: `src/i18n/en.json`

- [ ] **Step 1: Create `src/i18n/en.json` with an initial small set of strings**

```json
{
  "app.newProject": "New Project…",
  "app.openProject": "Open Existing Project…",
  "app.recentProjects": "Recent projects",
  "app.noRecentProjects": "No recent projects yet — open one to start.",

  "nav.pages": "Pages",
  "nav.navigator": "Navigator",
  "nav.components": "Components",
  "nav.assets": "Assets",
  "nav.cms": "CMS",
  "nav.terminal": "Terminal",

  "welcome.tagline": "Visual Builder for Astro",
  "welcome.createProject": "Create Project",
  "welcome.createProjectDesc": "Scaffold a minimal Astro starter — layout, components, and a home page.",
  "welcome.importAstro": "Import Astro Project",
  "welcome.importAstroDesc": "Use create-astro wizard to set up a project, then open it here.",
  "welcome.recentHeader": "Recent projects",
  "welcome.noRecent": "No recent projects yet.",

  "pagesPanel.heading": "Pages",
  "pagesPanel.createPage": "New page",
  "pagesPanel.createFolder": "New folder",
  "pagesPanel.search": "Search pages",
  "pagesPanel.delete": "Delete page",
  "pagesPanel.deleteConfirm": "Delete {name}? This removes the file from disk.",

  "structurePanel.heading": "Navigator",
  "structurePanel.empty": "Select a page to edit.",
  "structurePanel.dragHere": "Drag a component here",

  "propsPanel.settings": "Settings",
  "propsPanel.empty": "Select an element to edit its props.",
  "propsPanel.noComponents": "No components found in src/components.",

  "gitChip.commit": "Commit",
  "gitChip.push": "Push",
  "gitChip.publish": "Publish to GitHub",
  "gitChip.switchBranch": "Switch branch",
  "gitChip.createBranch": "Create branch",
  "gitChip.clean": "Clean",
  "gitChip.dirty": "Uncommitted changes",
  "gitChip.commitMessage": "Commit message",

  "cmsPanel.heading": "CMS Collections",
  "cmsPanel.newCollection": "New collection",
  "cmsPanel.empty": "No JSON collections found under src/.",

  "cmsView.addFirstItem": "Add the first item",
  "cmsView.nothingHere": "Nothing here yet.",
  "cmsView.noItemsMatch": "No items match \"{query}\".",
  "cmsView.searchItems": "Search items",
  "cmsView.settings": "Settings",
  "cmsView.backToItems": "Back to items",
  "cmsView.save": "Saved",
  "cmsView.deleteCollection": "Delete {label}",
  "cmsView.deleteField": "Delete field",
  "cmsView.deleteConfirm": "Delete the \"{label}\" field? Its content is removed from every item.",
  "cmsView.noFields": "No fields yet.",

  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.save": "Save",
  "common.done": "Done",
  "common.close": "Close",
  "common.back": "Back",
  "common.copy": "Copy",
  "common.duplicate": "Duplicate item"
}
```

- [ ] **Step 2: Create `src/i18n/I18nContext.jsx`**

```jsx
import React, { createContext, useContext, useMemo } from 'react';
import en from './en.json';

const I18nContext = createContext(null);

const LOCALES = { en };

export function I18nProvider({ locale = 'en', children }) {
  const strings = LOCALES[locale] || LOCALES.en;
  const t = useMemo(
    () => (key, params) => {
      let template = strings[key];
      if (template === undefined || template === null) {
        console.warn(`[i18n] Missing key: "${key}"`);
        return key;
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_, name) => {
        const value = params[name];
        return value !== undefined && value !== null ? String(value) : `{${name}}`;
      });
    },
    [strings]
  );
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT() {
  const t = useContext(I18nContext);
  if (!t) throw new Error('useT() must be used inside <I18nProvider>');
  return t;
}
```

- [ ] **Step 3: Write tests for the i18n infrastructure**

Create `src/i18n/I18nContext.test.jsx`:

```jsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { I18nProvider, useT } from './I18nContext.jsx';

function wrapper({ children }) {
  return <I18nProvider locale="en">{children}</I18nProvider>;
}

describe('useT', () => {
  it('returns the string for a known key', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('common.save')).toBe('Save');
  });

  it('interpolates params', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('pagesPanel.deleteConfirm', { name: 'about' })).toBe(
      'Delete about? This removes the file from disk.'
    );
  });

  it('falls back to the key when the key is missing', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    const key = 'nonexistent.key';
    expect(result.current(key)).toBe(key);
  });

  it('handles missing params gracefully', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('cmsView.noItemsMatch', {})).toBe(
      'No items match "{query}".'
    );
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/i18n/I18nContext.test.jsx`
Expected: PASS (4/4).

- [ ] **Step 5: Wrap `<App />` with `<I18nProvider>`**

In `src/main.jsx`:

```jsx
import { I18nProvider } from './i18n/I18nContext.jsx';

// Wrap the existing <App />:
root.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
```

- [ ] **Step 6: Commit**

```bash
git add src/i18n/ src/main.jsx
git commit -m "feat(i18n): add I18nProvider, useT hook, and English locale file"
```

---

### Task 2: Migrate `App.jsx` strings

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/i18n/en.json` (add any new keys discovered during migration)

- [ ] **Step 1: Import `useT`**

Add near the top of `App.jsx`:

```jsx
import { useT } from './i18n/I18nContext.jsx';
```

- [ ] **Step 2: Initialize `useT`**

In the `App` function body, after existing hooks:

```jsx
const t = useT();
```

- [ ] **Step 3: Replace hardcoded strings**

Find and replace toast message strings, button labels, and UI text in App.jsx. Key replacements:

| Current | Replacement |
|---------|-------------|
| `title="GitHub / Pages"` | `title={t('nav.pages')}` |
| `title="Navigator"` | `title={t('nav.navigator')}` |
| `title="Components"` | `title={t('nav.components')}` |
| `title="Assets"` | `title={t('nav.assets')}` |
| `title="CMS"` | `title={t('nav.cms')}` |
| `title="Terminal"` | `title={t('nav.terminal')}` |
| `` showToast(`Created ${name}.astro`, 'success') `` | `showToast(t('app.createdPage', { name: name + '.astro' }), 'success')` |
| `showToast('Project created', 'success')` | `showToast(t('app.projectCreated'), 'success')` |
| `showToast(\`Save failed: ...\`, 'error')` | `showToast(t('app.saveFailed', { error }), 'error')` |

Also add any new strings discovered to `en.json`.

- [ ] **Step 4: Verify the app builds**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/i18n/en.json
git commit -m "refactor(i18n): migrate App.jsx strings to t() calls"
```

---

### Task 3: Migrate WelcomeScreen, LeftRail, and GitChip

**Files:**
- Modify: `src/panels/WelcomeScreen.jsx`
- Modify: `src/ui/LeftRail.jsx`
- Modify: `src/panels/GitChip.jsx`
- Modify: `src/i18n/en.json` (add new keys)

- [ ] **Step 1: Migrate `WelcomeScreen.jsx`**

Import `useT`, call it, replace all hardcoded English strings. Key patterns:

| Current | Replacement |
|---------|-------------|
| `<h2>Visual Builder for Astro</h2>` | `<h2>{t('welcome.tagline')}</h2>` |
| `<button>New Project…</button>` | `<button>{t('app.newProject')}</button>` |
| `"Recent projects"` | `t('welcome.recentHeader')` |
| `"No recent projects yet."` | `t('welcome.noRecent')` |

- [ ] **Step 2: Migrate `LeftRail.jsx`**

Replace the 6 tab tooltips:

| Current | Replacement |
|---------|-------------|
| `title="Pages"` | `title={t('nav.pages')}` |
| `title="Navigator"` | `title={t('nav.navigator')}` |
| `title="Components"` | `title={t('nav.components')}` |
| `title="Assets"` | `title={t('nav.assets')}` |
| `title="CMS"` | `title={t('nav.cms')}` |
| `title="Terminal"` | `title={t('nav.terminal')}` |

- [ ] **Step 3: Migrate `GitChip.jsx`**

Replace branch-related labels, commit message placeholder, and status text. Add new keys to `en.json` as needed.

- [ ] **Step 4: Build and verify**

Run: `npx vite build`
Expected: Success.

- [ ] **Step 5: Commit**

```bash
git add src/panels/WelcomeScreen.jsx src/ui/LeftRail.jsx src/panels/GitChip.jsx src/i18n/en.json
git commit -m "refactor(i18n): migrate WelcomeScreen, LeftRail, and GitChip strings"
```

---

### Task 4: Migrate CMS panels

**Files:**
- Modify: `src/panels/CmsPanel.jsx`
- Modify: `src/panels/CmsView.jsx`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Migrate `CmsPanel.jsx`**

Replace the heading "CMS Collections", "New collection" button, and empty state text.

- [ ] **Step 2: Migrate `CmsView.jsx`**

Replace heading text, button labels, confirm dialog text, empty state text, and settings section headings. The `FIELD_TYPES` array (lines 58-74) contains user-facing labels — these should also be translated. But they're static — replace with `t()` calls at the usage site (the type badge render).

Add all new keys to `en.json`.

- [ ] **Step 3: Build and verify**

Run: `npx vite build`
Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add src/panels/CmsPanel.jsx src/panels/CmsView.jsx src/i18n/en.json
git commit -m "refactor(i18n): migrate CMS panel strings"
```

---

### Task 5: Migrate remaining core panels

**Files:**
- Modify: `src/panels/PagesPanel.jsx`
- Modify: `src/panels/StructurePanel.jsx`
- Modify: `src/panels/PropsPanel.jsx`
- Modify: `src/ui/InsertSearch.jsx`
- Modify: `src/ui/CodeWindow.jsx`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Migrate `PagesPanel.jsx`**

Replace heading, buttons, search placeholder, delete confirm text.

- [ ] **Step 2: Migrate `StructurePanel.jsx`**

Replace "Navigator" heading, empty state, drag hints.

- [ ] **Step 3: Migrate `PropsPanel.jsx`**

Replace "Settings" heading, empty states, field labels.

- [ ] **Step 4: Migrate `InsertSearch.jsx`**

Replace search placeholder, tab labels.

- [ ] **Step 5: Migrate `CodeWindow.jsx`**

Replace window title, close button label.

- [ ] **Step 6: Commit**

```bash
git add src/panels/PagesPanel.jsx src/panels/StructurePanel.jsx src/panels/PropsPanel.jsx src/ui/InsertSearch.jsx src/ui/CodeWindow.jsx src/i18n/en.json
git commit -m "refactor(i18n): migrate remaining core panel strings"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All existing tests pass.

- [ ] **Step 2: Run electron syntax check**

Run: `npm run check:electron`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Vite build succeeds.

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "chore(i18n): finalize core app i18n migration"
```
