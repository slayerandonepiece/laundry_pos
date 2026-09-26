# Desktop UI review: owner workspace (2026-09-22)

Lane: Desktop. Viewport 1440×900. Where noted, 1440×1540 was used to capture full-page screenshots. A 1024×768 pass followed.
Signed in as the owner (Gona Janardhan Reddy), with the outlet switcher left on "All outlets" throughout.
Nothing was saved. Every form was cancelled or discarded. The Orders outlet filter was applied once and then cleared.
All evidence comes from `getComputedStyle` / `getBoundingClientRect` measurements, `innerText`, or the accessibility tree.

### Dashboard `/`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-01 | P0 blocker | KPI tiles + "Recent orders — all outlets" | The "All outlets" aggregate leaves out the HSR Layout outlet, yet the subtitle says "Aggregated across 2 outlets". | KPIs read TODAY'S SALES ₹1,701 / ORDERS TODAY 3. The per-outlet cards on the same page read Chinnapnahalli ₹1,701/3 and HSR ₹60/1, so the true total is ₹1,761/4. Recent orders lists EL-5, EL-3, EL-2 and skips EL-4 (HSR, 22 Sept, ₹60), which Sales and Orders both show. | Aggregate over every allowed outlet (and org-wide orders). Add a test that checks KPI totals against the sum of the outlet cards. |
| D-02 | P1 | PENDING KPI vs outlet card "Pending" | The same word counts two different things on one screen. | The KPI shows `1`. The Chinnapnahalli card shows `2` (EL-2 Pending + EL-3 In Progress). | Use one definition ("not delivered" or "status = Pending") and label it clearly, e.g. "Open orders". |
| D-03 | P1 | "Earnings vs expenses — this month" | This month's earnings are lower than today's sales, and they don't match Sales for the same month. | Earnings ₹658 (Net ₹658) vs Today's sales ₹1,701 on the same page. Sales for "This month" shows Collected ₹1,537. | Show the same number for the same period, or rename the metric and add a tooltip that explains it (collected vs billed, which outlets). |
| D-04 | P2 | Range control `details.dashboard-range` ("14d ▾") | The popover doesn't close on Escape or on an outside click. It holds three conflicting controls, and the select disagrees with the pill. | After Escape: `open=true`. After clicking the page header: `open=true`. Inside: a "Last 14 days" button, a select whose value is `custom` ("Custom dates"), and From/To inputs, while the pill reads "14d". | Use the shared Dropdown (it closes on Escape and outside click). Make the select reflect the current preset. |
| D-05 | P2 | Sales-trend SVG axis labels | Unreadable. The "14 days" are drawn as 7 two-day buckets with only 3 x labels. | Computed 10.5px in `rgb(152,162,176)` on white gives **2.58:1** contrast. At 1024 wide the rendered glyph box is **7.5px** tall because the SVG scales down. The x labels read "9 Sept–10 Sept", "15 Sept–16 Sept", "21 Sept–22 Sept". "Previous period" has no visible line. | Use HTML/fixed-size axis text at 12px or more with contrast of at least 4.5:1. Plot daily points, or say "2-day buckets". |
| D-06 | P2 | Chart data-point `circle`s | Seven tab stops with no visible focus. | Tabbing to `circle "9 Sept 2026–10 Sept…"` gives `outline-style: none`, no box-shadow, no other indicator. | Add a focus ring (stroke) and a tooltip on focus, or take the circles out of the tab order and provide a data table. |
| D-07 | P3 | Per-outlet summary grid + section label | Two 369px cards leave an empty third column. The section title is styled unlike every other card title. | Cards at x=272 and 657, w=369, in a 1140px row, so ~385px is empty. Label "PER-OUTLET SUMMARY — TODAY, SHARE OF BEST-PERFORMING OUTLET" is blue uppercase 11px; other card titles are 15px/700 h2. | Use auto-fill columns that stretch. Give it a normal card title and move the share explanation into a subtitle. |
| D-08 | P2 | "Needs attention" row | Looks actionable but isn't. | "2 orders due today" plus an orange "Action" pill: `SPAN.badge.warn`, cursor `auto`, not focusable, no link. | Link it to Sales filtered to "Due today", and make the pill a real button. |

### App chrome and global consistency
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-09 | P3 | Page `h1` across screens | Four different page-title sizes. | Products/Sales/Expenses/Employees/Outlets/Profile 28px. Dashboard and Orders 22px. Outlet detail 20px. Expenses' second h1 22px. | One page-title token (e.g. 28px) everywhere. |
| D-10 | P2 | Sidebar footer + brand | Stale copy, and text too small to read. | Footer: "One store. Everything in view." while the org has 2 outlets. "STORE WORKSPACE" 9px, "WORKSPACE" 10px, footer text 11px in `rgb(104,117,138)`. | Show outlet count or context. Minimum 11–12px. |
| D-11 | P2 | Buttons with arrow glyphs | The "↗" external-link glyph is used on internal, in-page actions, and the two logout controls disagree. | "Log out ↗" (sidebar), "Edit ↗" (Products), "View ↗" (Outlets), "View detail ↗" (Dashboard), "Manage ↗" (Employees), "Save order ↗" (New sale). Profile has "Log out →". | Remove ↗ unless the action opens a new tab. Use a consistent icon set. |
| D-12 | P1 | Navigation / Orders screen | `/admin/orders` isn't in the sidebar, but Dashboard "View all →" goes there, and no nav item is active on arrival. Owners get two order lists (Sales register and Orders) with different columns, filters and detail UIs. | Nav links: Dashboard, Products, Sales, Expenses, Employees, Outlets, Profile (`aria-current` null on all at /admin/orders). "View all →" `href=/admin/orders`. | Either add Orders to the nav or point "View all" at Sales, and merge the two lists into one component. |
| D-13 | P3 | Button system | Two parallel button classes with different metrics. | `btn btn-primary/secondary`: 39–41px tall, radius 8px, 12.5–14px. `ad-button`: 45px tall, radius 9px (New sale, Profile, panel footers, confirm dialogs). | Consolidate on one Button component and size scale. |
| D-14 | P3 | Overlay patterns | Three overlay types with different titles and chrome. | Form dialog `.dialog`: div, title 16px, header bar, 29×29 ✕. Side panel `dialog.ad-dialog`: title 22px, 40×40 ×. Confirm `dialog.ad-confirm-dialog`: title 21px, no header, no ✕. | Standardise the title size and close affordance across all three. |
| D-15 | P3 | All forms | Validation is only the browser-native bubble. There are no styled inline errors anywhere. | Empty Add service → `validationMessage: "Please fill in this field."`. No `[role=alert]` or error nodes rendered in any dialog tested. | Inline field errors in the app's style. |

### Products `/admin/products`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-16 | P1 | Add/Edit service dialog (same bug in Add expense and Add/Edit employee) | Visible labels aren't linked to their fields. Screen readers announce selects by their value, and the Active switch has no name. Profile's Edit dialog does this correctly, so the dialogs are inconsistent. | `<label>Service name</label>` with no `htmlFor`/nesting, `input.labels.length=0` for name/category/charging/price. Accessibility tree: `combobox "Laundry"`, `combobox "Per item"`. Switch `role=switch aria-checked=true` with no label. Expense: title/category/amount/date `labels=0`. Employee: all 4 inputs `labels=0`. Edit profile: `labels=1` on every field. | Use the same `Field` wrapper everywhere (id + htmlFor). Name the switch "Active". |
| D-17 | P2 | Weight/slab editor (Add) | Placeholders look exactly like real data, and the slab row has no headers or units. The weight box is wide and the price box narrow. | Add form placeholders are 4 / 279 / 6 / 379 / 49; Edit of "Wash, Dry & Fold" shows real values 4 / 279 / 6 / 379 / 50, which look the same. Widths: weight 312px, price 110px. The hint reads "— add or remove a price break" with a stray leading dash. | Add column headers "Up to (kg)" and "Price (₹)" with unit adornments. Use obviously-placeholder text ("e.g. 4"). Balance the widths. |
| D-18 | P2 | Info banner vs catalogue card (same on Outlets) | The banner touches the card with no gap. The banner reuses the error-banner class. | Banner bottom y=212, card top y=212 (0px gap). Class `error-banner info`. | Add a 16px gap and give info notices their own class. |
| D-19 | P3 | Catalogue heading while searching | The count reflects the filtered result, which makes the catalogue look empty. The empty state has no way to clear the search. | Searching "zzzz" shows "Service catalogue (0)" and "No matching services", with only the "＋ Add service" button. | Show "0 of 6". Add a "Clear search" button. |
| D-20 | P3 | Naming | Nav says Products, the card says Service catalogue, the button says Add service. | Exact strings as quoted. | Pick one noun. |
| D-21 | P3 | Dialog close target | The close button is smaller than neighbouring icon buttons, and focus lands on it first. | Dialog ✕ 29×29 vs Remove slab 40×40 and panel × 40×40. `activeElement` on open = `button.dialog-close`. | Make ✕ 40×40 and focus the first field on open. |

### Sales `/admin/sales`, including the New sale panel
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-22 | P1 | Sales register rows (Orders table too) | Orders open only with the mouse. Rows aren't keyboard-reachable and aren't in the accessibility tree. | `<tr style="cursor:pointer">` with `tabIndex=-1` and no button or link inside. `read_page` lists no row controls. The Dashboard's equivalent uses `button "Open order EL-5"`. | Put a button or link on the order code cell (as Dashboard does), or make the row focusable with Enter support. |
| D-23 | P1 | New sale → Paid in full | It fills the amount once and doesn't stay in sync. After clicking it, changing the weight quietly leaves a balance, and the button shows no state. | Received ₹279 after Paid in full. Weight changed 1→5 kg: Subtotal ₹379, Received ₹279, Balance ₹100. `aria-pressed=null`, same class before and after. | Make it a toggle that keeps Received equal to Subtotal (pressed state visible), or recalculate on line changes. |
| D-24 | P1 | Payment methods: New sale / Record payment vs Profile | Different payment methods are offered in different places. | Profile → Payment methods: COD, Card, Cash, Upi, all switches `aria-checked=true`. New sale `select[name=method]` and order Record payment only offer `Cash, UPI`. Casing differs too ("Upi" vs "UPI"). | Use one source of truth, or explain on Profile why a method isn't available at checkout. |
| D-25 | P2 | New sale → Phone number | Accepts invalid input with no feedback. | Typing "12ab" gives `value="12ab"`, `checkValidity()=true`. `type=tel` with no `pattern`, `maxLength=-1`, no `inputmode`. The placeholder says "10-digit mobile number". | Add `pattern="[0-9]{10}"`, `inputmode="numeric"`, `maxlength=10`, and an inline error. |
| D-26 | P2 | New sale panel layout | Duplicated label, menu narrower than its trigger, slow service picking, mixed control types. | Section H3 "Outlet" and field label "Outlet" stacked. Outlet listbox 247px wide under a 680px trigger. Service picker lists names only (no prices, no type-ahead) for 6 services. Line controls 12px vs 14px elsewhere in the panel. Payment method appears only once Received > 0 (layout shift), as a native `select` next to custom dropdowns. | Drop the section heading. Match menu width to trigger. Show price in options and add type-ahead. Reserve space for the method field. |
| D-27 | P2 | Register columns vs filters | There's a payment-status filter but no payment column, and no outlet column even though the list spans outlets. | Columns: ORDER, CUSTOMER, STATUS, DATE, AMOUNT. Filters: "All work statuses", "All payment statuses". Dashboard's recent-orders table does include OUTLET. | Add Paid/Balance and Outlet columns. |
| D-28 | P3 | Period control and dates | Three different period controls across screens and two date formats. | Sales/Expenses: native `<select>` "This month" (13px, 150×44). Dashboard: "14d ▾" pill (12.5px, 30.5px tall). Orders: two bare date inputs. Range shown as "2026-09-01 — 2026-09-30" while tables show "22 Sept 2026". "IST · INR ₹" appears both in the toolbar and in the page footer. | One PeriodPicker component. Human date format. Show the IST note once. |
| D-29 | P3 | Filter toolbar | Heights and fonts don't line up. | Chips 40px/12px, search 44px/14px, dropdown triggers 39px/14px, "Clear" text link 34×44. Orders: date inputs 44px/12.5px, search 13px. | Use a single 40px control height and one font size in toolbars. |
| D-30 | P3 | KPI tiles | Three different KPI tile components exist. | Sales `ad-metric` (radius 14, padding 14/16, first tile solid `rgb(7,88,214)` with a decorative ring). Dashboard tiles (white, uppercase label). Outlet-detail mini tiles (bordered, 3-line labels at 1024). | One MetricTile with variants. |

### Order details (opened from Sales, Dashboard and Orders)
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-31 | P1 | Order details presentation | Order details look different depending on where they're opened, and the Orders version leaves out who the customer is. | From Sales or Dashboard: `dialog.ad-dialog-details`, a 720px right-hand panel with Customer, phone link, Expected delivery, Order total, and Pending/Unpaid badges. From Orders: `div.dialog.wide`, a 760px centred dialog titled only "EL-4", with no customer name, phone or outlet (`innerText.includes('QA Outlet Order')=false`, `includes('HSR')=false`). The work-status footer layout also differs (inline vs stacked label). | Render one OrderDetails component everywhere, with a header showing customer, phone and outlet. |
| D-32 | P2 | "Delivery & work progress" stepper | Completed steps look the same as future ones. | EL-5 (Delivered): indicator colours `rgb(226,232,240)` ×3 (Pending/In Progress/Ready) and `rgb(7,88,214)` only on Delivered. | Fill every completed step and highlight the current one. |
| D-33 | P2 | Items table + Bill card | Every line item appears twice. | EL-2: "Items (6)" table and the Bill card both list the same 6 services with amounts. | Keep one itemised list. The Bill card can show just totals and balance. |
| D-34 | P3 | Copy and hierarchy in details | Grammar mistakes, a heading-size inversion, and confusing colour coding. | "1 pcs", "1 services" (EL-5 header). H3 "Record a payment" 12px while sibling H3s are 16px. "Balance due ₹0" in a blue emphasis box on a paid order. "Pending" and "Unpaid" badges share the same amber. | Pluralise properly. Make the sub-heading a label. Use neutral or green styling when paid. Give payment status and work status distinct colours. |
| D-35 | P3 | Initial focus in details panel | Focus opens on the customer's `tel:` link, so pressing Enter dials. | `activeElement = <a href="tel:7702961863">`. | Focus the panel heading or the close button. |
| D-36 | P3 | Record payment | There's no quick "pay the balance" option, unlike New sale's "Paid in full". | Amount input `max=1043`, empty. No fill button. | Add "Pay balance ₹1,043". |

### Orders `/admin/orders`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-37 | P1 | Outlet multi-select filter | Filtering to one outlet still shows organisation-wide orders, and the subtitle doesn't update. | With Chinnapnahalli applied: 4 rows, including `EL-1 · Walk-in customer · Organization-wide · ₹819`. The subtitle still reads "Latest 5 across all outlets · page-numbered on desktop". | Exclude org-wide rows, or offer "Organization-wide" as its own option. Make the subtitle reflect the filter and drop "page-numbered on desktop" (developer wording). |
| D-38 | P1 | Date filters | A reversed range is accepted without warning, shows the first-use empty state, and there's no way to clear filters. | From 2026-09-30, To 2026-09-01 → "Nothing here yet — Get started by creating your first entry." The Orders toolbar has no Clear control (Sales has one). Date inputs have no min/max. | Stop To from being earlier than From (min/max). Show a "no orders match these filters" state with Clear filters. |
| D-39 | P2 | Outlet multi-select state | The trigger's state and the checkboxes disagree, and "Clear" doesn't take effect by itself. | Trigger reads "All outlets" while all three checkboxes (including "All outlets") are `checked=false`. Clear doesn't apply until Apply is clicked. The trigger grows to fit the outlet name, shifting the rest of the toolbar. | Tick "All outlets" by default. Apply Clear immediately. Fix the trigger's max-width. |
| D-40 | P2 | Date inputs + search | No accessible names. | `read_page`: `textbox [type=date]` ×2 with no name. The search has a placeholder only (`labels=0`). | Add visible "From"/"To" labels and an aria-label on search. |
| D-41 | P3 | Page layout | The content is inset twice, which wastes width and cramps rows at 1024. | Card x=302 vs 272 on other screens (1440). At 1024: card 664px wide in a 780px main, every row 62px, dates wrap to "22 Sept / 2026", customer names wrap. | Use the same page padding as other screens. `white-space:nowrap` on the date column. |

### Expenses `/admin/expenses`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-42 | P2 | Page header + section header | The page title and CTA are duplicated, and the subtitle describes a layout that doesn't exist. | Two `H1` "Expenses" (28px and 22px). Two "＋ Add expense" buttons visible together (header at y=249 and empty state at y=600). The subtitle says "Per-outlet and organization-wide costs, side by side", but the content is a single tabbed list. | One h1. Hide the header CTA when the empty-state CTA is showing (or the reverse). Fix the subtitle. |
| D-43 | P3 | Outlet filter pills + Add expense "Applies to" | Pill styling differs from Sales chips. The dropdown in the dialog is not full width. | Active pill is dark `rgb(16,32,57)` radius 999, while Sales chips are light-blue `rgb(234,242,255)` radius 8. "Applies to" trigger is 186×39 in a column of 478×44 inputs. | One segmented-filter style. Full-width 44px select. |

### Employees `/admin/employees`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-44 | P1 | Employee list | An active employee with no outlet can't work anywhere, and the screen doesn't flag it. The summary line contradicts the table. | Row: "Employee 1 · emp_01 · Outlets None · Active". The summary says "1 employee across 2 outlets". | Show a warning badge ("No outlet — can't sign in to sell") and a link to assign one. |
| D-45 | P2 | Row actions | The destructive action sits right next to the edit action, and the edit label doesn't match the dialog. | "Deactivate" (red text) and "Manage ↗" adjacent in every row. "Manage" opens a dialog titled "Edit employee". | Move Deactivate into the edit dialog or a menu. Rename the button "Edit". |
| D-46 | P2 | Add/Edit employee dialog | The password is shown in plain text, fields are unlabelled (D-16), and there are two dropdown types plus an oversized dialog. | "Temporary password" `type=text` (placeholder "At least 8 characters"). Phone `type=text`. Active outlets: custom multi-select 156×39. Default outlet: native select 676×44. Dialog 760px wide for 4 inputs (Product dialog 520px). Hints begin with "— ". | `type=password` with a show toggle. `type=tel`. Consistent select components. 520px dialog. |
| D-47 | P3 | Headings | The title is duplicated. | H1 "Employees" 28px immediately followed by H2 "Employees" 22px (same on Expenses). | Drop the section heading. |

### Outlets `/admin/outlets` and `/admin/outlets/<id>`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-48 | P0 blocker | Outlet detail "Today's snapshot", earnings and trend | The outlet dashboards show zero activity even though the main Dashboard shows sales for the same outlet today. | Chinnapnahalli detail: TODAY'S SALES ₹0, ORDERS TODAY 0, Earnings ₹0, "No recent order data". The Dashboard card for the same outlet shows ₹1,701 / 3 orders today. HSR detail is also all zeros (the Dashboard card shows ₹60 / 1). | Query by outlet the same way the Dashboard cards do, and cover it with a test. |
| D-49 | P3 | Outlet detail layout and copy | Oversized hit area, developer wording in subtitles, and uneven tiles at 1024. | The "← Back to outlets" link is 1140px wide (full-row hit area) at 12.5px. The subtitle reads "This outlet only · donut share". At 1024, "ITEMS SOLD TODAY" wraps to 3 lines and tile values sit at different heights. | Size the back link to its text. Clean up the subtitle copy. Clamp labels to one line or shorten them. |

### Profile `/admin/profile`
| ID | Severity | Where (element) | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| D-50 | P2 | Payment methods switches | One misclick instantly changes checkout at every outlet: there's no confirmation or undo. The switches are small and their labels read as commands. | Text: "Changes take effect immediately across all organization outlets". Switch 38×22px. `aria-label="Enable COD"` on a switch that is already `aria-checked=true`. Plus the list mismatch in D-24. | Confirm before disabling, or show an undo toast. Label the switch with the method name only. Make the target at least 40px. |
| D-51 | P3 | Card spacing / content parity | Vertical gaps in the right column are uneven, and the Edit dialog changes fields the page never shows. | Right-column gaps: 24px (Payment methods→Outlets) vs 44px (Outlets→Done for the day). Edit profile has "Store name" and "Store address" fields that don't appear anywhere on the Profile page. | Use a uniform 24px gap. Show store details on the page. |
| D-52 | P3 | Change password dialog | No inline guidance, and typed input is thrown away without the usual discard prompt. | New "abc" / confirm "xyz": `minLength=8`, but no mismatch or length message is shown. Cancel closes immediately (no "Discard changes?"), unlike Products and New sale. | Show requirements and a live mismatch hint. Use the same dirty-guard. |

---

## Top 10 to fix first
1. **D-01**: The "All outlets" Dashboard leaves out HSR (₹1,701 shown vs ₹1,761 actual; EL-4 missing).
2. **D-48**: The outlet detail pages show ₹0 / 0 orders for outlets that had sales today.
3. **D-31**: The Orders page's order dialog has no customer name, phone or outlet, and differs from the Sales/Dashboard panel.
4. **D-24**: Profile enables 4 payment methods but checkout offers only 2.
5. **D-23**: "Paid in full" goes stale after the order changes, leaving a hidden ₹100 balance.
6. **D-22**: Sales and Orders rows can't be opened from the keyboard.
7. **D-37**: The Orders outlet filter still shows org-wide orders, and the subtitle stays stale.
8. **D-38**: A reversed date range shows the "create your first entry" empty state, and Orders has no Clear control.
9. **D-16**: Form labels aren't linked to their fields in the Product, Expense and Employee dialogs.
10. **D-44 / D-02 / D-03**: An active employee with no outlet goes unflagged, and Pending and earnings figures disagree across the same screen.

## Count by severity
| Severity | Count |
|---|---|
| P0 blocker | 2 |
| P1 major | 11 |
| P2 minor | 19 |
| P3 polish | 20 |
| **Total** | **52** |

## Not tested / caveats
- **Escape on native `<dialog>` overlays** (the New sale panel, the Sales/Dashboard order-details panel, and the Log out confirmation) did not close them in any of my runs, even after clicking inside the dialog first. The source wires `onCancel` (`Primitives.tsx:19`, `ConfirmationDialog.tsx:13`), so this may be a quirk of how the automation sends keys. Div-based `.dialog`s did close on Escape. **Retest by hand** before filing it as a bug.
- **Expense mark-paid confirmation** wasn't tested because there are no expenses in the data.
- **Changing work status** (it saves), **Save / Record payment**, the **outlet switcher value**, and **Log out** were not exercised, per the rules. I didn't check whether the status select saves immediately or asks for confirmation.
- **Toasts, success feedback and route loading spinners** weren't observed, because nothing was saved. The Next dev "Rendering" badge covers the bottom-right corner.
- **Screenshots of scrolled pages don't work in this browser pane.** It draws blank space above the content, while the page itself is correct (checked with `elementFromPoint`). I captured full pages with a taller emulated viewport (1440×1540) instead, then did the 1440×900 and 1024×768 checks with measurements.
- **Invoice Print / Share / WhatsApp / Download** were not clicked. They open new windows or downloads.
