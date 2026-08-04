# Terminal Panel Title Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stacki terminal panel title use the same typography as the CMS panel title without changing the terminal panel's layout dimensions.

**Architecture:** Keep the existing `TerminalPanel` markup and the terminal-specific 52px header layout. Add a CSS contract test that compares the shared title declarations, then update only `.terminal-header h2` to match `.panel-header h2`.

**Tech Stack:** React 18, Vite 6, Vitest 3, Testing Library, plain CSS.

---

## File Structure

- Modify: `src/styles.css` — align the terminal heading declarations with the CMS panel heading.
- Create: `src/styles.test.js` — verify the two title rules stay typographically aligned.
- Modify: `src/panels/TerminalPanel.test.jsx` — preserve the terminal heading's semantic structure.
- No component markup or terminal behavior changes are required.

### Task 1: Add the failing typography contract test

**Files:**

- Create: `src/styles.test.js`
- Modify: `src/panels/TerminalPanel.test.jsx`

- [ ] **Step 1: Add a CSS rule reader and failing alignment test**

Create `src/styles.test.js` with:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
);

function declarationsFor(selector) {
  const match = styles.match(
    new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`),
  );
  if (!match) throw new Error(`Missing CSS rule: ${selector}`);

  return Object.fromEntries(
    match[1]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => declaration.split(':').map((part) => part.trim()))
  );
}

describe('panel title typography', () => {
  it('keeps the terminal title typography aligned with the CMS title', () => {
    const cmsTitle = declarationsFor('.panel-header h2');
    const terminalTitle = declarationsFor('.terminal-header h2');

    for (const property of ['font-size', 'font-weight', 'color', 'letter-spacing']) {
      expect(terminalTitle[property]).toBe(cmsTitle[property]);
    }
  });
});
```

Also add this focused structure assertion to the existing terminal panel test
file:

```jsx
it('renders the title inside the terminal header', () => {
  render(<TerminalPanel active={false} />);

  const title = screen.getByRole('heading', { name: 'Terminal' });
  expect(title.parentElement).toHaveClass('terminal-header');
  expect(title.tagName).toBe('H2');
});
```

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```bash
rtk npm test -- src/styles.test.js
```

Expected: FAIL because `.terminal-header h2` currently uses `18px` and
`650` and does not define the CMS rule's letter spacing.

### Task 2: Apply the minimal CSS alignment

**Files:**

- Modify: `src/styles.css:922-926`

- [ ] **Step 1: Match the CMS title declarations**

Change only the terminal heading rule to:

```css
.terminal-header h2 {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.01em;
}
```

Leave `.terminal-header` height, padding, border, and all terminal surface and
resize rules unchanged.

- [ ] **Step 2: Run the focused test and confirm GREEN**

Run:

```bash
rtk npm test -- src/styles.test.js src/panels/TerminalPanel.test.jsx
```

Expected: both the new alignment test and all existing terminal panel tests
pass.

- [ ] **Step 3: Commit the implementation**

```bash
rtk git add src/styles.css src/styles.test.js src/panels/TerminalPanel.test.jsx
rtk git commit -m "fix: align terminal panel title styling"
```

### Task 3: Run the full verification gate

**Files:**

- Verify: `src/styles.css`
- Verify: `src/styles.test.js`
- Verify: `src/panels/TerminalPanel.test.jsx`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
rtk npm test
```

Expected: Vitest exits 0 with no failed tests.

- [ ] **Step 2: Run the production renderer build**

Run:

```bash
rtk npm run build
```

Expected: Vite exits 0 and produces the production renderer in `dist/`.

- [ ] **Step 3: Review the final diff and working tree**

Run:

```bash
rtk git diff HEAD^ -- src/styles.css src/styles.test.js
rtk git status --short --branch
```

Confirm the implementation changes only the terminal title typography and
the new regression test, with no unrelated files or user edits present.
