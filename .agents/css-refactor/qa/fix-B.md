# Fix report — Agent B (Employees)

Date: 2026-09-21. Nothing staged or committed. No employee was saved; no data was written.

## Q-01 (S1): editing an employee overwrote their password: **fixed (edit path)**

**Files changed**
- `src/features/admin/components/EmployeeEditor.tsx:56`: the password input no longer has a fixed `value`. It is now uncontrolled and empty. The hint text moved to `placeholder` ("Leave blank to keep current" on edit, "Auto-generated — shown once on save" on create). Also added `minLength={8}`, `autoComplete="new-password"`, `autoCapitalize="none"` and `spellCheck={false}`. The inline `style={{ color: 'var(--muted)' }}` was removed; it only made the fake value look like a placeholder. `disabled={!employee}` is unchanged.
- `EmployeeEditor.tsx:33` did not need a change. `data.get('password') ? … : undefined` already turns `''` (field left blank) and `null` (field disabled) into `undefined`.

**Root cause.** On edit, `value="Leave blank to keep current"` with no `onChange` produced a read-only controlled field that React still included in the form submission. That 27-character string is at least 8 characters, so it passed both the container check (`AdminScreenContainer.tsx:111`) and the server's `z.string().min(8)`. The server then treated it as a new password.

**Before → after (DOM and FormData, 1440 and 375, Manage → Cancel, never saved)**
| | Before (D-01) | After |
|---|---|---|
| Edit, untouched: `input.value` | `"Leave blank to keep current"` | `""` |
| Edit, untouched: `new FormData(form).get('password')` | `"Leave blank to keep current"` → sent as the new password | `""` → line 33 yields `undefined` |
| Edit, after a real click and typing `TempPass123` | the keystrokes were ignored | `value` and `FormData` are `"TempPass123"`, `checkValidity()` is true |
| Edit: console warning "value prop … without onChange" | present | none |
| Add: field | disabled, `FormData` `null` | disabled, `FormData` `null`, placeholder only (unchanged) |

**Server side** (`src/server/services/employees.ts` `updateEmployee`, L104-L195; called by `updateEmployeeAction` and `PUT /api/v1/employees/[id]`):
- The schema is `password: z.union([z.string().min(8), z.literal('')]).optional()`, and `passwordChanged = Boolean(data.password)`.
- `undefined` means the password is unchanged: no hash, no `credentialVersion` bump from the password, and sessions stay intact (unless the username changed).
- `''` also means unchanged, because `Boolean('')` is false. An empty string is **not** stored as a password.
- A non-blank value of 8 or more characters is hashed. It also sets `mustChangePassword: true` and revokes the employee's sessions.

**Create path: already broken, left as it was.** The brief assumed the server auto-generates the password. It does not.
- `createEmployee`'s schema requires `password: z.string().min(8)`. Neither `createEmployee` nor `createEmployeeAction` generates or returns a password. The only generator in the codebase is Super Admin's `generatePassword()` in `platform-users.ts`, which this path does not use.
- The "Auto-generated — shown once on save" copy came from the 2.0 design (`OWNER-WORKSPACE-2.0-REQUIREMENTS.md` §6). The Gemini-lane rewrite (`caf8f79`) added it with no backend support. Before that rewrite (`04e6356`), the field was a required password input with a "Show password" toggle.
- Today, **Add employee cannot succeed**. With the field disabled, `password` is `undefined`, so `AdminScreenContainer.tsx:111` runs `draft.password!.length` on `undefined` and throws a TypeError inside the submit handler. Nothing reaches the server. If it did, zod would reject it.
- The brief said not to change the server contract and not to change create behaviour, so I left this alone. Two ways to fix it; this needs an owner decision:
  - (a) Implement real auto-generation. `createEmployee` would generate the password and return it once, and the dialog would display it. This is a server contract change.
  - (b) Re-enable the field on create as a required temporary password of at least 8 characters, which matches today's server contract.
  The client fix for (b) is one line in `EmployeeEditor.tsx`. The container guard is in `AdminScreenContainer.tsx`, which I don't own.

## Q-06 (S2): Employees list had no mobile layout: **fixed**

**Files changed**
- `src/features/admin/components/Employees.tsx:51-52`: the table wrapper changed from inline `overflowX:auto` to `className="employees-table-wrap"`.
- `Employees.tsx:94-121`: new `.employees-cards` list with one `<article className="employee-card">` per employee. Each card shows the name, username, Active/Inactive badge, outlet `Tag`s (default outlet marked, or "No outlets"), and both actions (Deactivate/Reactivate and Manage ↗) with the same handlers as the table.
- `src/app/(workspace)/admin/owner-workspace.css`, block appended at the end of the file, comment "Employees list — same table/card split…": `.employees-table-wrap`, `.employees-cards`, `.employee-card`, `.employee-card-actions` (+ `.btn` with `min-height:40px`). No other selectors were touched.

**Pattern.** This is the same table/card split as `Catalogue.tsx` (`.catalogue-table-wrap` / `.catalogue-cards`): the table is hidden and the cards shown under a breakpoint. The card is an `article` rather than the catalogue's single `button`, because each employee has two actions.

**Breakpoint 900px instead of the catalogue's 767px.** At 768 the sidebar leaves the card only 466px (a 428px table wrapper). The four-column table with two nowrap buttons needs about 500px, so a 767 breakpoint would leave the 768 bug in place. At 901 the table fits.

**Before → after**
| Width | Before | After |
|---|---|---|
| 375 | table `scrollWidth 396` in a `303` wrapper, name `td` 94px, actions scrolled out of view | table hidden. Card 303px, `scrollWidth == clientWidth` (301). Name on one line (17px). Deactivate and Manage are each 133×**40**px and fully in view. Document `scrollWidth` is 375 |
| 768 | table `438` in a `428` wrapper. Column widths [68, 75, 77, 219], name wrapped over 2 lines (36.5px) | card 428px, no overflow. Name 17px. Buttons 195×40 |
| 901 | n/a | table shown, `561 == 561`. Columns [113, 90, 93, 265], name on one line |
| 1440 | table 1100/1100, columns [223, 177, 181, 519] | unchanged: table shown, cards hidden |

All column information and both actions are reachable at every width.

**Outlets multi-select in the editor.** It already used the shared `MultiSelectDropdown` correctly (label, options, selected, onChange). I added `requireSelection` (`EmployeeEditor.tsx:65`) because the field says "select at least one". Apply is now disabled while nothing is ticked, and the verified 375 menu showed `Apply` disabled with 0 ticked. `ui/Dropdown.tsx` was not edited.

**Caveat.** The only employee in the dev data has no outlets, so outlet `Tag` wrapping inside a card was not seen with real tags. It is the same `Tag` + flex-wrap markup as the table cell.

## How tested
- Own tab (`tab-3`). I never touched tab `seed` and never clicked Log out. The tab was closed at the end with the viewport reset.
- Q-01: Manage → FormData checks → typed a value with a real keystroke → Cancel. Add employee → FormData check → Cancel. **No Save clicked anywhere.**
- Q-06: DOM measurements at 375, 768, 901 and 1440. One screenshot at 375 as evidence.

## Gates (`npx tsc --noEmit --incremental false`, `npx eslint .`)
| | Before | After |
|---|---|---|
| tsc errors | 8 (scratch/Catalogue ×3, scratch/ProductEditorContainer ×2, src/app ×1, AdminScreenContainer ×2) | 8, identical files |
| eslint | 9 problems (1 error, 8 warnings) in scratch/ProductEditorContainer and orders/page.tsx | 9 (1 error, 8 warnings), identical |
| eslint on my two files | n/a | clean |

No new errors.

## Cross-agent requests
- **Agent A (Dropdown):**
  - At 375, inside the Edit employee dialog, every `.dropdown-check-row` measured **85px** tall in a 230px-wide menu. That looks like the checkbox-row layout issue you are fixing.
  - `EmployeeEditor` now depends on your `requireSelection` prop. Please keep that name, or tell me if it changes.
- **Owner/parent (unowned file `AdminScreenContainer.tsx`):**
  - The create-employee crash described above (`draft.password!.length` on `undefined`, line 111) needs a product decision, (a) or (b).

## New findings (not fixed)
1. **Add employee is broken end to end**; see the create path under Q-01. Severity is S1-level for onboarding staff.
2. The `EmployeeEditor` **Phone** field is collected but never sent: it is missing from the `onSave` draft and from `EmployeeDraft`, and `defaultValue=""` ignores any stored phone. Anything typed there is silently dropped.
3. The editor always sends `active: true` (`EmployeeEditor.tsx:34`). Saving the Manage dialog of an **inactive** employee would reactivate them without asking.
4. The dialog's **Cancel** button closed a dirty Edit dialog (password typed) with no "Discard changes?" prompt, despite `warnOnChanges`. Worth checking `ui/Dialog`, which none of the agents own.
5. The Employees screen shows two stacked "Employees" headings: `AdminScreenContainer`'s page heading plus `Employees.tsx`'s own `<h1>`. The same likely applies to other 2.0 screens.
