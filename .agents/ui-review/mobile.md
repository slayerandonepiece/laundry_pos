# Mobile UI review — Owner workspace (375×812, spot-check 390×844 / 360×740)

Reviewed 2026-09-22. Signed in as store owner "Gona Janardhan Reddy" (Reddy's Laundry, 2 outlets).
Read-only pass; no Save/Submit/Record payment/Deactivate/Log out were confirmed. One accidental
programmatic submit on the Change Password dialog occurred during validation testing (mismatched
confirm password + wrong current password) — the server rejected it (mismatch error shown, no
password change occurred, confirmed via response text); no further submit buttons were exercised
for the rest of the session as a precaution.

Note: partway through the session the Browser pane became hidden (not something this review
controlled) and screenshots stopped compositing. From that point (Outlets detail screen onward,
plus the 390×844 / 360×740 spot-checks) findings were verified with `read_page`, `get_page_text`,
and `javascript_tool` DOM/layout measurements instead of pixel screenshots. Those findings are
still measured, not guessed, but are called out below where relevant.

### Dashboard `/`
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M-01 | P2 | Custom date-range popover (chart "14d" control) → From/To `<input type=date>` | Native date inputs are too narrow for their own value + calendar icon; the last digit of the year is visually clipped/overlapped by the icon | Measured `input[type=date]` width = 128px, height 44px, font 16px; value `2026-09-09` renders as `09/09/202` with the calendar icon overlapping the final "6" (same on the "To" field) | Widen the date inputs (~150–160px) or drop the native icon in favor of a custom affordance |
| M-02 | P3 | Recent orders table (Dashboard) | Table scrolls horizontally with no visual affordance (no fade edge, no "swipe" hint); the OUTLET column is cut off exactly at the container edge, reading as a bug rather than an intentional scroll | Measured: table `scrollWidth` 582px vs wrapper `clientWidth` 303px, `overflow-x: auto` | Add a right-edge fade gradient or a small "◀▶ scroll" affordance; consider a card layout instead of a table on mobile |

### App chrome (sidebar drawer / topbar / dropdowns) — cross-screen
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M-03 | P2 | Hamburger button, avatar "G", nav-drawer links, most dialog Cancel/Save buttons, toggle switches, "View all"/"View detail" links, checkbox rows | Touch targets consistently under the 44×44px minimum across every screen tested | Measured: hamburger/avatar 40×40px; nav-drawer items 278×38px; dialog Cancel/Save buttons ~41–45px tall; payment-method/Active toggles 38×22px; "View all →" 63×17px / 94×37px; "View detail ↗" 115×39px; Expenses checkbox row label 40px tall; Outlet-detail "← Back to outlets" link 343×19px | Raise the minimum hit area to 44×44px (padding, not just visual size) for all of the above, especially the toggle switches and back-link |
| M-04 | P2 | Outlet switcher, "New sale" outlet picker, "Select a service" picker (custom dropdowns) vs. Products' Category/Charging-type and Payment-method selects (native `<select>`) | Two different dropdown implementations are mixed across the same workspace: some are native `<select>` elements, others are custom button+popover widgets with no scrim, that overlay the field below them | Confirmed via `read_page`: Outlet picker and Service picker in New Sale render as `button` + `generic` popover list (not `combobox`), while Products' Category/Charging-type and New Sale's Payment method render as real `select`/`combobox` elements | Standardize on one pattern (prefer native `<select>` on mobile for OS-native picker UX and consistent a11y) |
| M-05 | P3 | Filter pill rows (Sales register "Selected dates/Due today/Late", Expenses "All/Organization-wide/Reddy's Lau...", Orders "All status/Pending/In progress/Ready/Delivered") | Pill rows overflow horizontally with no scroll affordance; on Orders the row is wide enough that "In progress" is cut off mid-word ("In prog|") on first paint before any scrolling | Screenshot: Orders pill row shows "All status | Pending | In prog" clipped at the 375px edge; same pattern reproduced on Expenses' outlet pills | Add a scroll-fade/chevron indicator, or wrap pills to a second line instead of horizontal scroll |

### Sales `/admin/sales` — New sale panel
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M-06 | P3 | "New sale" → phone number field, required-field validation | No visible custom inline error is shown when Save is attempted with an empty required phone number — the app relies solely on native HTML `required`/browser validation (`validationMessage: "Please fill in this field."`), which did not visibly surface anything in this in-app browser pane beyond auto-focusing/scrolling to the field | Confirmed via `document.activeElement.validationMessage` after clicking Save order with phone empty; no red text/toast appeared in the screenshot | Add an explicit inline error message under the field so validation failure is visible regardless of native browser-bubble support |
| — | — | Outlet picker / Service picker popovers | Already covered by M-04 (custom, no scrim, overlays fields below) | | |
| — | info | "Paid in full", live subtotal/received/balance footer, Discard-changes guard on Cancel | All worked correctly — footer recalculated live after selecting a service and toggling Paid in full; Cancel correctly triggered a "Discard changes?" dialog with Keep editing/Discard, and Discard closed without saving | | |

### Orders `/admin/orders`
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M-07 | P1 | Order list — Customer/Outlet two-column layout | Customer names wrap mid-word with no hyphen, e.g. "AppTeam" renders as "AppTea" / "m" on its own line, and "ReddyGona" renders as "ReddyG" / "ona" — despite visible spare width in the row | Screenshot (Orders list, EL-5 and EL-2 rows) shows the literal mid-word breaks; DOM check found `overflow-wrap: anywhere` applied to the name span even though its measured line width (47px) is far short of needing a break for a 7-character word at 16px. Matches a previously-flagged leftover global `overflow-wrap: anywhere` rule noted in `.agents/CURRENT-STATE.md` for the marketing-site CSS bleed-through, which the Super Admin reskin scoped away under `.soa` but the store workspace apparently still inherits | Give the customer-name/outlet cells their own width (e.g. `min-width`/`flex-basis`) instead of relying on `overflow-wrap: anywhere`, or scope/remove the global `overflow-wrap` rule from the store workspace the way it was scoped out of Super Admin |
| M-08 | P1 | Orders screen, mobile | Screen literally states "Latest 5 across all outlets · page-numbered on desktop" and shows "Showing 1–5 of 5" with no search box, no outlet filter, and no date filter — only a status-pill filter. Desktop's Orders screen has outlet multi-select, status, dates, and search per the brief; none of that exists on mobile except status | Full page text dump confirms no search input, no outlet selector, no date range control exist on this route at 375px; copy explicitly admits "page-numbered on desktop" (i.e., not on mobile) | If a store has more than 5 orders, a mobile counter operator has no way to reach older orders or search by customer/phone. Add pagination or infinite scroll and the missing filters to the mobile Orders view, or explicitly redirect mobile users to use Sales' fuller order search |

### Sales — order details / Bill card
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M-09 | P2 | Order invoice PDF (View PDF from a Delivered/Paid order, e.g. EL-5 → INV-000003) | Store address line renders as a bare "-" before the phone number: "Reddy's Laundry" / "- · 7702961863" — an empty address field still emits its separator, producing a stray dash on a customer-facing PDF | Screenshot of the opened PDF viewer, header block: "Reddy's Laundry\n- · 7702961863" | Omit the separator/dash entirely when the address field is empty, on both the customer invoice and the Super Admin subscription invoice if they share the template helper |
| — | info | Invoice action row (Print/View PDF/Share/Share via WhatsApp/Download PDF) | Buttons are 37px tall (covered by M-03); functionally all worked — View PDF correctly opened the in-app PDF panel with Print/Open in new tab/Download | Measured 55–148px × 37px | Covered by M-03 |

### Products `/admin/products`
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| M-10 | P2 | Every service card in the catalogue | The full internal UUID (e.g. `3695aa24-e5b7-4774-b62d-523b577e17cb`) is printed on every card, taking a full text line purely as visual noise for an owner who never needs it — worse on a 375px screen where vertical space for a 6-item list is already tight | Screenshot: every card shows `<uuid> · <category>` on its own line, e.g. "3695aa24-e5b7-4774-b62d-523b577e17cb · Laundry" | Drop the raw ID from the card; keep category only, or show a short id only in an edit/debug context |
| — | info | Add service dialog (Per item / By weight-slabs), Cancel, Charging-type/Category selects | All native `<select>`s, all fonts 16px (no iOS zoom risk), slab add/remove rows fit 3-across cleanly, Cancel correctly closed with no changes saved | | |

### Expenses `/admin/expenses`
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| — | info | Add expense dialog, "Repeat monthly"/"Already paid today" checkboxes, empty state | Layout is clean and fits; empty state ("No expenses yet") is friendly. Checkbox rows are 40px tall (covered by M-03). Could not test "mark paid" confirm dialog — this store had zero expenses recorded, so no existing entry was available to open (see Untested list) | | |

### Employees `/admin/employees`
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| — | info | Employee card, Edit/Add employee dialogs, outlet multi-select popover | All fit cleanly; the multi-select "Select outlets" checklist with Apply/Clear worked correctly and was closed without applying. The per-employee "Outlets (N)" disclosure described in `CURRENT-STATE.md` appears to have been superseded by the Active-outlets field directly inside the Edit employee dialog — not a defect, just a note that the on-card "No outlets" text has no way to see/manage outlets without opening Edit | Confirmed via card text "No outlets" plus Edit dialog containing "Active outlets"/"Default outlet" fields | Consider surfacing outlet count/names on the card itself so an owner doesn't need to open Edit just to check assignment |

### Outlets `/admin/outlets` and outlet detail
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| — | info | Outlets list, outlet detail (Chinnapnahalli) | No horizontal overflow (scrollWidth == clientWidth == 375px); "View" buttons open detail correctly; detail page's stats/donut/status tiles all rendered with real zeros for an outlet with no activity today, no fabricated data | | |
| M-11 | P3 | Outlet detail → "← Back to outlets" link | Very short tap target height | Measured 343×19px | Increase the link's vertical padding to at least 44px tall |

### Profile `/admin/profile`
| ID | Severity | Where | What's wrong | Evidence | Suggested fix |
|---|---|---|---|---|---|
| — | info | Profile details, Payment methods toggles, Outlets summary table, Change password dialog | No horizontal overflow. Change password dialog fit at 343×492px; all three password inputs 301×46px at 16px font (no iOS zoom risk); mismatch validation correctly surfaced "Use a different password of at least 8 characters and confirm it exactly." and did not change the password (server rejected — wrong current password + mismatched confirmation) | Payment-method toggles (COD/Card/Cash/Upi) are 38×22px — covered by M-03 | Covered by M-03 |
| — | untested | "Edit" profile dialog | Not opened as a real click (pane went hidden right before this could be tested with visual confirmation); DOM structure alone wasn't independently verified for this dialog | | |

## Could not test
- The Browser pane became hidden partway through the session (outside this review's control), which stopped screenshot compositing and blocked real `computer` clicks for the remainder of the pass (Outlets detail onward, and both spot-check viewports). Those areas were still measured via `read_page`/`get_page_text`/`javascript_tool`, but were not visually screenshotted.
- Expenses "mark paid" confirmation dialog: the store had zero recorded expenses, so no existing entry existed to open the confirm dialog from.
- Profile → Edit profile dialog: not opened after the pane went hidden.
- Logout confirmation was tested and Cancelled successfully (Dashboard, via the sidebar drawer) before the pane issue occurred; it was not re-tested from the Profile screen's separate logout button.
- 390×844 and 360×740 spot-checks were limited to horizontal-overflow checks (both clean, `scrollWidth === clientWidth`) plus re-confirming the Orders word-wrap bug (M-07) via text dump; full visual walkthroughs at those two sizes were not possible once the pane was hidden.

## Top 10 to fix first
1. **M-07** (P1) — Customer/outlet names break mid-word on Orders list ("AppTea"/"m") — looks broken, likely a leftover global `overflow-wrap: anywhere` rule.
2. **M-08** (P1) — Orders screen on mobile has no search/outlet/date filters and is hard-capped to 5 orders with no pagination ("page-numbered on desktop" only).
3. **M-03** (P2) — Touch targets under 44px are systemic: hamburger, avatar, nav-drawer rows, dialog buttons, toggle switches, back-link.
4. **M-04** (P2) — Inconsistent dropdown pattern: native `<select>` vs. custom popover buttons used interchangeably across the same workspace.
5. **M-01** (P2) — Custom date-range picker's native date inputs clip the year digit under the calendar icon.
6. **M-09** (P2) — Customer invoice PDF shows a stray "-" where the store address should be.
7. **M-10** (P2) — Raw internal UUIDs printed on every Products card, wasting mobile vertical space.
8. **M-05** (P3) — Filter pill rows overflow with no scroll affordance; Orders' row visibly cuts a label mid-word ("In prog").
9. **M-02** (P3) — Dashboard's Recent Orders table scrolls horizontally with no affordance, clipping the Outlet column.
10. **M-06** (P3) — New sale's required phone-number validation has no visible custom error message.

## Severity counts
- P0: 0
- P1: 2 (M-07, M-08)
- P2: 6 (M-01, M-03, M-04, M-09, M-10, plus M-05 borderline — counted as P3 below)
- P3: 4 (M-02, M-05, M-06, M-11)

(11 numbered findings total: 2×P1, 5×P2, 4×P3.)
