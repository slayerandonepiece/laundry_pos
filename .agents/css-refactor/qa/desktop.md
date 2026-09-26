# Desktop QA — owner workspace (1440px, 1024px)

Tested against the running dev server at `http://localhost:3000`, signed in as owner
"Gona Janardhan Reddy" of organization "Reddy's Laundry" (2 outlets: Chinnapnahalli,
HSR Layout). Browser pane became hidden partway through the session (host-side); all
findings from that point on are backed by DOM/CSS measurements and code reads
(`javascript_tool`, `read_page`, `graft`) rather than fresh screenshots, and are called
out as such below.

| ID | Sev | Screen | Width | Bug | Evidence | Source (file:line) | Suggested fix |
|----|-----|--------|-------|-----|----------|---------------------|----------------|
| D-01 | S1 | Employees — Edit employee dialog | 1440 | The "Temporary password" field on **Edit employee** is rendered with a fixed `value` and no `onChange`/`disabled`/`readOnly`, so it is not actually editable but **is** included in form submission every time. Saving any employee edit (name, phone, outlets…) sends the literal string `"Leave blank to keep current"` as the new `password` field value, which `onSave` treats as an explicit password change. This would silently overwrite the employee's real password on every edit. | DOM check on the live field: `{"disabled":false,"value":"Leave blank to keep current","readOnly":false}`. React/Next dev overlay also throws: "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field." at `EmployeeEditor.tsx:56`. Code: `onSave` does `password: data.get('password') ? String(data.get('password')) : undefined` — always truthy here. Not saved during this QA pass (read-only constraint). | `src/features/admin/components/EmployeeEditor.tsx:56` (field), `:33` (submit handler that trusts it) | Use `placeholder=` (or `defaultValue` + real `onChange`) instead of a fixed `value`, and/or keep the field genuinely `disabled` in edit mode so it's excluded from `FormData`. |
| D-02 | S2 | Sales — Order details panel | 1440 | The 4-stage delivery/work-status stepper ("Pending / In Progress / Ready / Delivered") is a CSS grid hardcoded to **3 columns**, but the step list has 4 items (extended from 3 to 4 states per the WorkStatus vocabulary change). The 4th item ("Delivered") wraps onto a new row directly under "Pending", and its blue "current step" indicator bar renders under "Pending" instead of at the end — a Delivered order visually looks like it's stuck at "Pending". | DOM measurement on order EL‑1 (status = Delivered): row 1 items at `y=374.5` (Pending/In Progress/Ready), "Delivered" li at `y=436` (new row), same `left:550.5` as Pending. `aria-current="step"` correctly on the Delivered `<li>` (data is right, layout is wrong). Container: `display:grid`, computed width 439.5px holding 4×141px items. | `src/app/(workspace)/admin/tables.css:145` — `.ad-delivery-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));...}`; steps array of 4 in `src/features/admin/components/OrderDeliveryDetails.tsx:4-9` | Change to `repeat(4,minmax(0,1fr))` (or `auto-fit`/flex-wrap sized for 4). |
| D-03 | S2 | Products — Add service dialog, "By weight (slabs)" mode | 1440 | Opening **Add service** (brand-new, empty name) and switching Charging type to "By weight (slabs)" pre-fills real-looking pricing: slab 1 = 4kg/₹279, slab 2 = 6kg/₹379, extra = ₹49/kg — identical in shape to two existing real services' prices. These are live input `value`s (not placeholders), so an owner who doesn't notice and clicks Save creates a new service with someone else's pricing. | `javascript_exec` on the live dialog: `input[type=number]` values `["4","279","6","379","49"]` (real `value`, not `placeholder`). | `src/features/admin/containers/ProductEditorContainer.tsx:11-13` — `useState` defaults `[{limit:4,price:27900},{limit:6,price:37900}]` / `extra 4900` used whenever `product` is undefined | Default new-service weight slabs to empty/zero, not specific priced values. |
| D-04 | S2 | Sales — "New sale" panel | 1440 | Escape does not close the New Sale panel (it does close every other dialog tested: Products Add/Edit service, Add expense). First Escape only moves focus to the panel's close (×) button; a second Escape does nothing further. | Instrumented the open dialog: after dispatching Escape, `window` keydown listener fired (`keydownFired:1`) but the dialog's native `cancel` event never fired (`cancelFired:0`), and `dialog.open` stayed `true`. Confirmed the same panel component (`Panel`, native `<dialog>` + `showModal()`) is used; Products' dialog is a different, div-based `Dialog` with an explicit `window` keydown→Escape handler, which *did* close reliably and returned focus to the trigger. | `src/features/admin/components/Primitives.tsx:14-19` (`Panel`, relies solely on native `<dialog>` cancel event) vs. `src/features/admin/components/ui/Dialog.tsx:61-66` (explicit keydown handler) | Give `Panel` the same explicit `window` keydown→Escape handler as `ui/Dialog.tsx`, rather than relying only on the browser's native dialog "cancel" event. |
| D-05 | S2 | Dashboard — Sales trend chart | 1440 | When there is no sales data in the selected 14-day window, the chart still draws gridline labels for a fake maximum of ₹100 (₹100 / ₹66.7 / ₹33.3) directly above the "No booked sales in this period." empty-state message — i.e. the empty state and a populated-looking axis render at the same time. | Accessibility tree of the chart `<svg>`: `"₹100"`, `"₹66.7"`, `"₹33.3"` axis labels present, while every one of the 7 point buttons reads `"…: ₹0"` and the empty-state paragraph is also rendered. | `src/features/admin/components/DashboardCharts.tsx:16` — `const maximum = Math.max(...amounts, 10000)` (hardcoded 10000-paise/₹100 fallback) feeding the axis labels at line 30 | When all points are 0, skip drawing axis gridline labels (or use a `0` maximum so labels read ₹0), consistent with the empty-state message. Note: the outlet-detail page's own trend chart avoids this — it shows plain "No recent order data." text with no `<svg>` at all. |
| D-06 | S2 | Sales / Products | 1440 & 1024 | Sales (and, by extension, "New sale") has **no outlet indicator or switcher anywhere on the page or topbar**, even though orders are outlet-owned data and this owner has 2 active outlets. Dashboard has an "All outlets ▾" switcher, Expenses has outlet tabs, Employees lists an Outlets column — Sales has neither, so there's no way to see or change which outlet's orders are being listed, or which outlet a new sale will be attributed to. | `AdminChrome.tsx` only renders an outlet-control portal (`#dashboard-outlet-control`) when `screen === 'dashboard'`; Sales' own page/container (`OrderEditorContainer.tsx`, `Sales.tsx`) has zero references to `outlet`. Confirmed via `read_page` of the Sales topbar (`banner`): only nav toggle, breadcrumb, user name, avatar — no outlet control. | `src/features/admin/components/AdminChrome.tsx` (outlet portal gated to `screen === 'dashboard'` only); `src/features/admin/containers/OrderEditorContainer.tsx` (no outlet field) | Surface the resolved outlet name (read-only label is enough, matching the documented "single outlet, no All-outlets" design) somewhere on the Sales header, the way Expenses/Employees already do. |
| D-07 | S3 | Products — Add/Edit service dialog | 1440 | The submit button always reads "Save changes", even when adding a brand-new service. Other add flows in the same app use action-specific labels (Add expense → "Save expense"; Add employee → "Save & create login"). | `read_page` of the Add-service dialog: submit button text "Save changes" while dialog title is "Add service". | `src/features/admin/containers/ProductEditorContainer.tsx:53` | Use "Add service" (or similar) as the submit label when `!product`. |
| D-08 | S3 | Profile — Edit profile dialog | 1440 | The Phone field's accessible name is computed from its `title` attribute ("Enter a valid phone number with 10 to 15 digits") instead of its wrapping `<label>Phone</label>`, because the `title` attribute takes precedence in accessible-name computation. A screen reader announces the validation hint instead of "Phone". | `read_page` accessibility tree: `textbox "Enter a valid phone number with 10 to 15 digits"` for the field wrapped in `<label>Phone…`. Confirmed via DOM: `input[name=phone]` has `title="Enter a valid phone number with 10 to 15 digits"` and no `aria-label`. | Edit-profile form (Profile feature) — phone `<input>` with `title` attribute | Drop the `title` (rely on the `<label>` + native validation message), or add an explicit `aria-label="Phone"`. |

## Needs a product decision

- **D-03's "sensible defaults" intent**: the pre-filled weight-slab values on Add
  Service could be a deliberate convenience (skip typing for the common case)
  rather than an oversight — but as implemented it's indistinguishable from real
  data and risks accidental bad pricing. Flagging for a product call rather than
  asserting it's purely a bug.
- **Employees page copy** "1 employee across 2 outlets · deactivating restricts
  their sign-in to this organization only" reads, at a glance, as if the one
  employee has access to both outlets — but this employee's own Outlets column
  says "None". The sentence is describing the *organization's* outlet count, not
  the employee's, which is easy to misread. Worth a copy tweak or confirmation
  this is intended.
- **D-06 (no outlet indicator on Sales)** may already be accepted scope per
  `.agents/CURRENT-STATE.md`'s note that "Orders and Expenses restrict the owner
  to one outlet at a time" (narrower than the original multi-outlet brief) — but
  that note doesn't explicitly say Sales has *zero* visible outlet context (not
  even a read-only label), which seems like a stronger gap than "no All-outlets
  option". Included above in case it wasn't previously scoped this precisely.

## Coverage

- **Screens × widths covered**: Dashboard, Products (+ Add service in both Per-item
  and By-weight modes, Edit dialog), Sales (+ New sale dialog, order detail panel),
  Expenses (+ Add expense dialog, outlet filter pills), Employees (+ Add employee,
  Manage/Edit dialog, Outlets disclosure), Outlets (list + one outlet detail page
  via View), Profile (+ Edit profile, Change password dialogs) — all checked at
  1440×900. A full pass of horizontal-overflow checks (`scrollWidth` vs
  `clientWidth` on every element) was additionally run at 1024×768 on Dashboard,
  Sales, Products, Employees, and Expenses.
- **Console/network**: `read_console_messages` (errors only) and
  `read_network_requests` checked on every screen; no failed network requests
  found anywhere. The only console errors found are the two duplicate React
  warnings tied to D-01.
- **Could not test**: Visual screenshot verification for the second half of the
  session (from Employees onward) — the Browser pane became hidden host-side
  (`preview is not displayed`) and could not be re-opened from this session, so
  Profile, Outlets-detail, and the 1024px pass were verified via `read_page`
  accessibility trees, `get_page_text`, and `javascript_tool` DOM/CSS
  measurements instead of pixel screenshots. This is generally *more* precise for
  layout-numeric bugs (D-02, D-03, D-05) but means purely-visual issues (color
  contrast, subtle spacing polish) on those later screens may have been missed.
  Keyboard tab-order was spot-checked (Escape/focus-return on dialogs) but a full
  Tab-key walk through the sidebar and every dialog's field order was not
  completed for the same reason.
- **Bug counts**: S1: 1 (D-01) · S2: 4 (D-02, D-03, D-04, D-06) · S3: 2 (D-07, D-08).

🌱 graft saved ~48,000 tokens this turn (sum of per-call "tokens saved" lines above).
