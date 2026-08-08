# FUNCTEST REPORT — automated end-to-end functional suite

**121 passed / 0 failed / 11 known-gap**  ·  132 scenarios  ·  10857ms

- Generated: 2026-08-08T20:55:19.996Z
- Database: `hr_erp_sandbox` (sandbox-only — the guard refuses anything else)
- Command: `npm run functest`
- Fixture month: `1903-06` · fixture tag: `FT`

| State | Meaning |
|---|---|
| ✅ PASS | actual == expected |
| ❌ FAIL | real defect or regression — **fails the run** |
| ⚠️ KNOWN-GAP | asserts correct behaviour against a documented missing/broken feature; reported, does not fail the run |
| 🎉 FIXED | a KNOWN-GAP case now passes — close the gap in the docs |

---

## BILLING — 23 passed / 0 failed

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **BILL-01** per_person — 2 fő × 30 éj × 3500 (+ rent 300 000 → margin) | {"net":210000,"vat":56700,"gross":266700,"cost":300000,"margin":-90000,"employee_days":60} | {"net":210000,"vat":56700,"gross":266700,"cost":300000,"margin":-90000,"employee_days":60} | ✅ PASS |
| **BILL-02** flat — fully covered month bills the whole 300 000 (headcount-independent) | {"net":300000,"vat":81000,"gross":381000,"basis":"flat"} | {"net":300000,"vat":81000,"gross":381000,"basis":"flat"} | ✅ PASS |
| **BILL-03** flat — prorated 15/30 covered days of 900 000 | {"net":450000,"vat":121500,"gross":571500,"cost":150000,"margin":300000} | {"net":450000,"vat":121500,"gross":571500,"cost":150000,"margin":300000} | ✅ PASS |
| **BILL-04** VAT taxable — 27% gross math on a per_person line | {"net":210000,"vat":56700,"gross":266700,"vat_exempt":false} | {"net":210000,"vat":56700,"gross":266700,"vat_exempt":false} | ✅ PASS |
| **BILL-05** VAT áfamentes — 0 VAT, gross = net | {"net":105000,"vat":0,"gross":105000,"vat_exempt":true} | {"net":105000,"vat":0,"gross":105000,"vat_exempt":true} | ✅ PASS |
| **BILL-06** legal type company → normal invoice, payroll_handoff false | {"payroll_handoff":false,"legal_type":"company","note":null} | {"payroll_handoff":false,"legal_type":"company","note":null} | ✅ PASS |
| **BILL-07** legal type private → payroll_handoff marker, NO payroll calculation anywhere | {"net":120000,"vat":32400,"payroll_handoff":true,"note":"~Bérszámfejtendő magánszemély~","deductions_created":0,"payments_created":0} | {"net":120000,"vat":32400,"gross":152400,"payroll_handoff":true,"note":"Bérszámfejtendő magánszemély — bruttó összeg; nettó + NAV a könyvelő feladata","deductions_created":0,"payments_creat… | ✅ PASS |
| **BILL-08** invoicing OFF → client skipped entirely (no billing row at all) | {"rows_for_that_client":0,"skipped_clients":1} | {"rows_for_that_client":0,"skipped_clients":1} | ✅ PASS |
| **BILL-09** per_bed used+empty — cap 100 / 3500 / 1500 / 90%, 95 foglalt → 340 000/éj | {"net":10200000,"vat":2754000,"avg_full_beds":95,"reduced_bed_nights":150,"capacity":100} | {"net":10200000,"vat":2754000,"avg_full_beds":95,"reduced_bed_nights":150,"capacity":100} | ✅ PASS |
| **BILL-10** per_bed occupancy FLOOR — 80 foglalt lifts to the 90-bed guarantee → 330 000/éj | {"net":9900000,"avg_full_beds":90,"avg_occupied_beds":80,"reduced_bed_nights":300} | {"net":9900000,"avg_full_beds":90,"avg_occupied_beds":80,"reduced_bed_nights":300} | ✅ PASS |
| **BILL-11** per_bed above the floor — 92 foglalt → 334 000/éj | {"net":10020000,"avg_full_beds":92,"reduced_bed_nights":240} | {"net":10020000,"avg_full_beds":92,"reduced_bed_nights":240} | ✅ PASS |
| **BILL-12** Autoliv — 60 lekötött ágy @ 90%, 40 foglalt → 198 000/éj (billed at the 54 floor) | {"net":5940000,"vat":1603800,"avg_full_beds":54,"occupied_bed_nights":1200,"reduced_bed_nights":180} | {"net":5940000,"vat":1603800,"avg_full_beds":54,"occupied_bed_nights":1200,"reduced_bed_nights":180} | ✅ PASS |
| **BILL-13** per_bed used-only (floor 0, rate_empty 0) → plain per-occupied-bed: 42 × 3000 × 30 | {"net":3780000,"vat":1020600.0000000001,"rate_empty":0,"floor_pct":0} | {"net":3780000,"vat":1020600,"rate_empty":0,"floor_pct":0} | ✅ PASS |
| **BILL-14** per_bed capacity fallback — contracted_beds NULL → the site's 60 PHYSICAL beds | {"net":5940000,"capacity":60,"contracted_beds":null,"physical_beds":60} | {"net":5940000,"capacity":60,"contracted_beds":null,"physical_beds":60} | ✅ PASS |
| **BILL-15** per_bed over-occupancy — 65 fő in a 60-bed block: all at rate_used, empties clamped to 0 | {"net":6825000,"reduced_bed_nights":0,"avg_full_beds":65} | {"net":6825000,"reduced_bed_nights":0,"avg_full_beds":65} | ✅ PASS |
| **BILL-16** mixed site — two megbízók → TWO separate invoices on one accommodation | {"rows":2,"distinct_clients":2,"distinct_runs":1} | {"rows":2,"distinct_clients":2,"distinct_runs":1} | ✅ PASS |
| **BILL-17** mixed site — megbízó A @ 3000: 180 000 net, rent+expense share 280 000 | {"net":180000,"cost":280000,"margin":-100000,"employee_days":60} | {"net":180000,"vat":48600,"gross":228600,"cost":280000,"margin":-100000,"employee_days":60} | ✅ PASS |
| **BILL-18** mixed site — megbízó B @ 5000: 450 000 net, own cost share, own margin | {"net":450000,"cost":420000,"margin":30000,"employee_days":90} | {"net":450000,"vat":121500,"gross":571500,"cost":420000,"margin":30000,"employee_days":90} | ✅ PASS |
| **BILL-19** compensation → separate line on the WORKER's megbízó, excluded from housing net/margin | {"housing_net":60000,"compensation":57000,"margin":60000,"lines":2} | {"housing_net":60000,"compensation":57000,"margin":60000,"lines":2} | ✅ PASS |
| **BILL-20** compensation status filter — issued+escalated billed; DISPUTED and waived excluded | {"billed":["FT-C001","FT-C004"],"total":57000} | {"billed":["FT-C001","FT-C004"],"total":57000} | ✅ PASS |
| **BILL-21** compensation with no resolvable megbízó → surfaced in the run summary, never dropped | {"unattached":1,"reason":"no_megbizo","amount":20000} | {"unattached":1,"reason":"no_megbizo","amount":20000} | ✅ PASS |
| **BILL-22** run summary — partner count, unbilled groups, intentional skips | {"partner_count":5,"groups_no_billing_client":2,"skipped_clients":1,"status":"calculated","run_type":"incoming"} | {"partner_count":5,"groups_no_billing_client":2,"skipped_clients":1,"status":"calculated","run_type":"incoming"} | ✅ PASS |
| **BILL-23** re-running the month is idempotent — prior run cancelled, identical totals | {"prior_cancelled":"cancelled","totals_identical":true,"active_runs":1} | {"prior_cancelled":"cancelled","totals_identical":true,"active_runs":1} | ✅ PASS |

## COST — 9 passed / 0 failed

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **COST-01** FLAT — rent 600 000, 12 fő across 4 rooms → allocates 600 000, NOT 600 000 × 4 | {"cost":600000,"basis":"flat","site_rent":600000,"not_multiplied":true} | {"cost":600000,"basis":"flat","site_rent":600000,"not_multiplied":true} | ✅ PASS |
| **COST-02** FLAT — rooms are still on the snapshots (occupancy analytics keep working) | {"snapshot_rows":12,"rows_with_a_room":12,"distinct_rooms":4} | {"snapshot_rows":12,"rows_with_a_room":12,"distinct_rooms":4} | ✅ PASS |
| **COST-03** PER-BED — 10 foglalt ágy × 800 Ft × 30 éj = 240 000 | {"cost":240000,"basis":"per_bed_night","bed_nights":300,"rate":800} | {"cost":240000,"basis":"per_bed_night","bed_nights":300,"rate":800} | ✅ PASS |
| **COST-04** VEGYES — flat 300 000 + the utility lines we pay (70 000) = 370 000 | {"basis":"mixed","rent_cost":300000,"expense_cost":70000,"cost":370000} | {"basis":"mixed","rent_cost":300000,"expense_cost":70000,"cost":370000} | ✅ PASS |
| **COST-05** VEGYES — only the passthrough line is re-billed (áram 50 000 @ 100%), and it is margin-neutral | {"passthrough_net":50000,"lines":["aram"],"margin_neutral":true} | {"passthrough_net":50000,"lines":["aram"],"margin_neutral":true} | ✅ PASS |
| **COST-06** a utility the matrix says the szállásadó pays is FLAGGED, never silently absorbed | {"flagged":true,"reason":"expense_recorded_but_szallasado_pays","run_surfaces_it":true} | {"flagged":true,"reason":"expense_recorded_but_szallasado_pays","run_surfaces_it":true} | ✅ PASS |
| **COST-07** profit dashboard reconciles under all three bases (profit ≡ engine margin) | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **COST-08** utilities matrix over real HTTP — always six lines, round-trips, permission-gated | {"lines_returned":6,"resident_status":403,"saved_who_pays":"mi","saved_pct":60} | {"lines_returned":6,"resident_status":403,"saved_who_pays":"mi","saved_pct":60} | ✅ PASS |
| **COST-09** coverage view flags no-basis / missing amount / incomplete utilities matrix | {"flags_unset_site":true,"has_incomplete_matrix_flag":true,"types":true} | {"flags_unset_site":true,"has_incomplete_matrix_flag":true,"types":true,"_types":["no_rent_basis","incomplete_utilities_matrix","missing_rent_amount"]} | ✅ PASS |

## CONSOLIDATION — 12 passed / 0 failed / 3 known-gap

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **CONS-01** shift matrix is IDENTITY — every cross-shift pairing incompatible, empty shift compatible with nobody | {"same_shift_ok":true,"cross_shift_blocked":true,"empty_vs_known":false,"empty_vs_empty":false} | {"same_shift_ok":true,"cross_shift_blocked":true,"empty_vs_known":false,"empty_vs_empty":false} | ✅ PASS |
| **CONS-02** groupValid rejects mixed gender / cross-shift / mixed workplace, allows an identical cohort | {"mixed_gender":false,"cross_shift":false,"mixed_workplace":false,"identical":true} | {"mixed_gender":false,"cross_shift":false,"mixed_workplace":false,"identical":true} | ✅ PASS |
| **CONS-03** solvable site — 4 identical residents in 4 two-bed rooms → 2 rooms freed, 2 moves | {"freed_rooms":2,"moves":2,"freed_beds":4} | {"freed_rooms":2,"moves":2,"freed_beds":4} | ✅ PASS |
| **CONS-04** cross-shift site is BLOCKED — no proposal at all for it | {"proposed":false,"suggestions_for_site":0} | {"proposed":false,"suggestions_for_site":0} | ✅ PASS |
| **CONS-05** incomplete data — the shift-less resident is FLAGGED, never moved; the rest still consolidate | {"flagged":true,"moved":false,"freed_rooms":1} | {"flagged":true,"moved":false,"freed_rooms":1} | ✅ PASS |
| **CONS-06** INDEPENDENT re-verification of EVERY suggestion in a full run → zero constraint violations | {"gender_violations":0,"shift_violations":0,"workplace_violations":0,"capacity_violations":0,"cross_accommodation":0} | {"gender_violations":0,"shift_violations":0,"workplace_violations":0,"capacity_violations":0,"cross_accommodation":0,"_checked":{"suggestions":7,"rooms":10,"sites":4}} | ✅ PASS |
| **CONS-07** no incomplete-data employee appears in ANY suggestion of the full run | {"flagged_in_moves":0,"flagged_total_gt0":true} | {"flagged_in_moves":0,"flagged_total_gt0":true} | ✅ PASS |
| **CONS-08** approve one site → room_id applied, suggestions marked applied, move logged in history | {"ok":true,"applied":2,"room_changed":true,"status":"applied","history_logged":true} | {"ok":true,"applied":2,"room_changed":true,"status":"applied","history_logged":true} | ✅ PASS |
| **CONS-09** PARTIAL completion — approving one site leaves the run partially_applied, other sites pending | {"run_status":"partially_applied","other_sites_still_pending":true} | {"run_status":"partially_applied","other_sites_still_pending":true} | ✅ PASS |
| **CONS-10** reject archives with a reason and never applies the move | {"ok":true,"status":"rejected","reason":"functest: nem szükséges","room_unchanged":true} | {"ok":true,"status":"rejected","reason":"functest: nem szükséges","room_unchanged":true} | ✅ PASS |
| **CONS-11** committed DB after apply — the approved site has ZERO invalid rooms | {"invalid_rooms":0,"rooms_now_occupied":2} | {"invalid_rooms":0,"rooms_now_occupied":2} | ✅ PASS |
| **CONS-12** re-applying the same site is refused (nothing pending) | {"ok":false,"error":"nothing_pending"} | {"ok":false,"error":"nothing_pending"} | ✅ PASS |
| **CONS-13** LOCK constraint — a locked resident must never be proposed for a move | {"lock_field_exists":true} | {"lock_field_exists":false} | ⚠️ KNOWN-GAP |
| **CONS-14** 60-DAY STABILITY — a resident moved recently must not be moved again inside the window | {"stability_window_days":60,"engine_reads_move_history":true} | {"stability_window_days":null,"engine_reads_move_history":false} | ⚠️ KNOWN-GAP |
| **CONS-15** approve → TICKET → confirm → room change (staged lifecycle) | {"approve_creates_ticket":true,"room_change_awaits_confirmation":true} | {"approve_creates_ticket":false,"room_change_awaits_confirmation":false} | ⚠️ KNOWN-GAP |

## PERMISSIONS — 16 passed / 0 failed / 5 known-gap

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **PERM-01** DEEP_AUDIT 1–4 — a real resident login is 403 on every leak endpoint | {"not_403":[]} | {"not_403":[]} | ✅ PASS |
| **PERM-02** the same endpoints stay OPEN to a superadmin (the fix did not over-block) | {"wrongly_403":[]} | {"wrongly_403":[]} | ✅ PASS |
| **PERM-03** a resident holds NO staff permission at all → 403 on every gated staff endpoint | {"reachable":[]} | {"reachable":[]} | ✅ PASS |
| **PERM-04** role "superadmin" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-05** role "admin" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-06** role "data_controller" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-07** role "property_owner" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-08** role "contractor" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-09** role "property_inspector" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-10** role "maintenance_worker" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-11** role "task_owner" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-12** role "accommodated_employee" — HTTP access matches the permission model exactly | {"mismatches":[]} | {"mismatches":[]} | ✅ PASS |
| **PERM-13** cross-tenant WRITE — tenant-1 operator cannot mutate a tenant-2 employee | {"row_changed":false,"status":403} | {"row_changed":false,"status":403} | ✅ PASS |
| **PERM-14** cross-tenant READ — tenant-1 operator listing employees sees no tenant-2 rows | {"foreign_ids_returned":0} | {"foreign_ids_returned":3,"_status":200} | ⚠️ KNOWN-GAP |
| **PERM-15** cross-tenant READ — finance endpoints scope to the caller's contractor | {"endpoints_returning_foreign_data":[]} | {"endpoints_returning_foreign_data":["/expenses → 200","/profit/by-accommodation?month=1903-07 → 200","/operating-costs/by-accommodation?month=1903-07 → 200"]} | ⚠️ KNOWN-GAP |
| **PERM-16** timesheets — one tenant cannot read another tenant's logged hours by task id | {"rows_returned":0,"foreign_email_exposed":false} | {"rows_returned":1,"foreign_email_exposed":true,"_status":200} | ⚠️ KNOWN-GAP |
| **PERM-17** GET /rooms/:id/inspection-history requires a permission | {"resident_status":403} | {"resident_status":200} | ⚠️ KNOWN-GAP |
| **PERM-18** GET /analytics/overview requires a permission | {"resident_status":403} | {"resident_status":200} | ⚠️ KNOWN-GAP |
| **PERM-19** worker-specialization WRITES require a permission — a resident cannot create reference data | {"status":403,"row_created":false} | {"status":403,"row_created":false} | ✅ PASS |
| **PERM-20** GTD metadata writes are gated — a resident cannot rewrite a ticket's GTD fields | {"status":403,"ticket_modified":false} | {"status":403,"ticket_modified":false} | ✅ PASS |
| **PERM-21** an unauthenticated caller gets 401 everywhere (no anonymous surface) | {"non_401":[]} | {"non_401":[]} | ✅ PASS |

## REPORTS — 12 passed / 0 failed / 3 known-gap

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **REP-01** report "employees" — row count reconciles with the source table, sheet + columns present | {"rows_match_source":true,"sheet":"Munkavállalók","has_columns":true,"blank_rows":0} | {"rows_match_source":true,"sheet":"Munkavállalók","has_columns":true,"blank_rows":0,"_rows":835,"_source":835,"_columns":13} | ✅ PASS |
| **REP-02** report "accommodations" — row count reconciles with the source table, sheet + columns present | {"rows_match_source":true,"sheet":"Szálláshelyek","has_columns":true,"blank_rows":0} | {"rows_match_source":true,"sheet":"Szálláshelyek","has_columns":true,"blank_rows":0,"_rows":50,"_source":50,"_columns":7} | ✅ PASS |
| **REP-03** report "tickets" — row count reconciles with the source table, sheet + columns present | {"rows_match_source":true,"sheet":"Hibajegyek","has_columns":true,"blank_rows":0} | {"rows_match_source":true,"sheet":"Hibajegyek","has_columns":true,"blank_rows":0,"_rows":12,"_source":12,"_columns":10} | ✅ PASS |
| **REP-04** report "contractors" — row count reconciles with the source table, sheet + columns present | {"rows_match_source":true,"sheet":"Alvállalkozók","has_columns":true,"blank_rows":0} | {"rows_match_source":true,"sheet":"Alvállalkozók","has_columns":true,"blank_rows":0,"_rows":10,"_source":10,"_columns":7} | ✅ PASS |
| **REP-05** report "occupancy" — row count reconciles with the source table, sheet + columns present | {"rows_match_source":true,"sheet":"Kihasználtság","has_columns":true,"blank_rows":0} | {"rows_match_source":true,"sheet":"Kihasználtság","has_columns":true,"blank_rows":0,"_rows":50,"_source":50,"_columns":7} | ✅ PASS |
| **REP-06** report "cost_centers" — row count reconciles with the source table, sheet + columns present | {"rows_match_source":true,"sheet":"Havi költségek","has_columns":true,"blank_rows":0} | {"rows_match_source":true,"sheet":"Havi költségek","has_columns":true,"blank_rows":0,"_rows":16,"_source":16,"_columns":4} | ✅ PASS |
| **REP-07** profit dashboard identity — profit = income − (expenses + rent) on every seeded site | {"rows_violating_identity":[]} | {"rows_violating_identity":[],"_sites":21} | ✅ PASS |
| **REP-08** profit ≡ billing engine margin — per accommodation and in total | {"mismatched_sites":[],"summary_matches":true} | {"mismatched_sites":[],"summary_matches":true} | ✅ PASS |
| **REP-09** mixed-client site — dashboard totals reconcile with both invoices | {"income":630000,"expenses":100000,"rent":600000,"profit":-70000} | {"income":630000,"expenses":100000,"rent":600000,"profit":-70000} | ✅ PASS |
| **REP-10** capacity columns — committed / lekötetlen / empty bed-nights on the Autoliv block | {"physical_beds":100,"committed_beds":60,"uncommitted_beds":40,"empty_bed_nights":180,"occupied_bed_nights":1200} | {"physical_beds":100,"committed_beds":60,"uncommitted_beds":40,"empty_bed_nights":180,"occupied_bed_nights":1200,"full_bed_nights":1620} | ✅ PASS |
| **REP-11** compensation appears on the dashboard as a pass-through, never inside profit | {"compensation_amount":57000,"profit_excludes_compensation":true} | {"compensation_amount":57000,"profit_excludes_compensation":true} | ✅ PASS |
| **REP-12** operating-costs totals reconcile with accommodation_expenses rows | {"matches_source":true} | {"matches_source":true,"_reported":210000,"_source":210000} | ✅ PASS |
| **REP-13** employees report — Email/Telefon come from the EMPLOYEE record, not the login | {"email":"report.subject@functest.local","phone":"+36 30 000 1234"} | {"email":"","phone":""} | ⚠️ KNOWN-GAP |
| **REP-14** cost_centers report honours its configured filters | {"filter_changed_output":true} | {"filter_changed_output":false,"_unfiltered_rows":16,"_filtered_rows":16} | ⚠️ KNOWN-GAP |
| **REP-15** occupancy report "as of" uses the LOCAL date, not UTC | {"tz_probe_occupied":1} | {"tz_probe_occupied":0} | ⚠️ KNOWN-GAP |

## DATA — 23 passed / 0 failed

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **DATA-01** room move via the real API → the next occupancy snapshot shows the NEW room | {"status":200,"snapshot_room_is_new":true,"open_history_rows":1,"history_room_is_new":true} | {"status":200,"snapshot_room_is_new":true,"open_history_rows":1,"history_room_is_new":true} | ✅ PASS |
| **DATA-02** consolidation approve → history followed every applied room change | {"moves_applied_gt0":true,"rows_not_matching_employee":[],"reasons":["consolidation"]} | {"moves_applied_gt0":true,"rows_not_matching_employee":[],"reasons":["consolidation"]} | ✅ PASS |
| **DATA-03** hire via the real API → an open history row exists immediately | {"status":201,"open_rows":1,"accommodation_matches":true,"reason":"hire"} | {"status":201,"open_rows":1,"accommodation_matches":true,"reason":"hire"} | ✅ PASS |
| **DATA-04** termination via the real API → the stay ends, the bed stops counting today | {"status":200,"open_rows":0,"covers_today":0} | {"status":200,"open_rows":0,"covers_today":0} | ✅ PASS |
| **DATA-05** termination of a LONG-STANDING resident closes the stay instead of deleting it | {"status":200,"open_rows":0,"closed_rows":1,"covers_today":0} | {"status":200,"open_rows":0,"closed_rows":1,"covers_today":0} | ✅ PASS |
| **DATA-06** no employee ever has two history rows covering the same day | {"overlapping_pairs":[]} | {"overlapping_pairs":[]} | ✅ PASS |
| **DATA-07** the roster and its history agree — every housed employee has a matching open row | {"employees_out_of_sync":0} | {"employees_out_of_sync":0} | ✅ PASS |
| **DATA-08** mid-month transfer A→B — 15 occupancy days each, never 31 or 29 | {"days_at_A":15,"days_at_B":15,"total":30} | {"days_at_A":15,"days_at_B":15,"total":30} | ✅ PASS |
| **DATA-09** same-day transfer — the handover day belongs to the NEW accommodation only | {"on_handover_day":"TransferTo","rows_that_day":1} | {"on_handover_day":"TransferTo","rows_that_day":1} | ✅ PASS |
| **DATA-10** transfer pro-rata — each site bills its own 15 days at 2000/fő/éj and its own rent share | {"net_A":30000,"net_B":30000,"cost_A":150000,"cost_B":150000} | {"net_A":30000,"net_B":30000,"cost_A":150000,"cost_B":150000} | ✅ PASS |
| **DATA-11** expiry monitor — a visa expiring in 10 days fires in the 14-day bucket | {"alerts":1,"threshold_days":14} | {"alerts":1,"threshold_days":14} | ✅ PASS |
| **DATA-12** expiry monitor — contract (5 days → bucket 7) and document (45 days → bucket 60) also fire | {"contract_bucket":7,"document_bucket":60} | {"contract_bucket":7,"document_bucket":60} | ✅ PASS |
| **DATA-13** expiry monitor — an expiry 400 days out is NOT alerted (outside every window) | {"alerts":0} | {"alerts":0} | ✅ PASS |
| **DATA-14** expiry monitor is idempotent — a second run creates no duplicate alerts | {"rows_unchanged":true,"second_run_fired":0} | {"rows_unchanged":true,"second_run_fired":0} | ✅ PASS |
| **DATA-15** hygiene fine — toggle OFF creates nothing, even with two failing inspections | {"skipped":true,"reason":"disabled","fines":0} | {"skipped":true,"reason":"disabled","fines":0} | ✅ PASS |
| **DATA-16** hygiene fine — 2 consecutive fails (7 pt) → exactly ONE fine, 10 000 Ft × 2 lakó | {"created":1,"fines_on_room":1,"amount_gross":20000,"residents":2,"per_resident":10000} | {"created":1,"fines_on_room":1,"amount_gross":20000,"residents":2,"per_resident":10000} | ✅ PASS |
| **DATA-17** hygiene fine is idempotent — a second run creates 0 and reports skipped_existing | {"created":0,"skipped_existing":1,"fines_on_room":1} | {"created":0,"skipped_existing":1,"fines_on_room":1} | ✅ PASS |
| **DATA-18** hygiene fine — a room with only ONE failing inspection is never fined | {"fines":0} | {"fines":0} | ✅ PASS |
| **DATA-19** hygiene fine writes NO payment and NO salary deduction (deduction executor stays mothballed) | {"payments":0,"deductions":0} | {"payments":0,"deductions":0} | ✅ PASS |
| **DATA-20** GDPR erasure — identifying fields nulled, surname pseudonymized, anonymized_at set | {"first_name":null,"mothers_name":null,"passport_number":null,"social_security_number":null,"bank_account":null,"personal_email":null,"surname_pseudonymized":true,"anonymized_at_set":true} | {"first_name":null,"mothers_name":null,"passport_number":null,"social_security_number":null,"bank_account":null,"personal_email":null,"surname_pseudonymized":true,"anonymized_at_set":true} | ✅ PASS |
| **DATA-21** GDPR erasure emits an itemized receipt (rowcounts + file outcomes + completeness) | {"ok":true,"complete":true,"has_rowcounts":true,"files_failed":0,"receipt_persisted":true} | {"ok":true,"complete":true,"has_rowcounts":true,"files_failed":0,"receipt_persisted":true} | ✅ PASS |
| **DATA-22** GDPR — INDEPENDENT sweep: the PII marker survives in zero text columns | {"columns_still_containing_marker":[]} | {"columns_still_containing_marker":[],"_columns_scanned":35} | ✅ PASS |
| **DATA-23** GDPR erasure is not repeatable — a second request is refused | {"ok":false,"error":"already_anonymized"} | {"ok":false,"error":"already_anonymized"} | ✅ PASS |

## VIDEO — 12 passed / 0 failed

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **VID-01** a resident is still 403 on the STAFF video endpoints (Path B holds) | {"list":403,"detail":403,"view":403} | {"list":403,"detail":403,"view":403} | ✅ PASS |
| **VID-02** the self-scoped library returns globals and resolves playback to the resident's language | {"status":200,"sees_global":true,"language":"uk","playback_is_uk":true,"in_my_language":true} | {"status":200,"sees_global":true,"language":"uk","playback_is_uk":true,"in_my_language":true} | ✅ PASS |
| **VID-03** a scoped video they were never sent stays invisible | {"visible_in_list":false,"direct_fetch":404} | {"visible_in_list":false,"direct_fetch":404} | ✅ PASS |
| **VID-04** a targeted send makes the video visible to that resident and nobody else | {"recipients":1,"now_visible":true,"marked_as_sent":true,"language_logged":"uk"} | {"recipients":1,"now_visible":true,"marked_as_sent":true,"language_logged":"uk"} | ✅ PASS |
| **VID-05** watch evidence: the resident records progress on their OWN behalf only | {"status":200,"completed":true,"stored_for_caller":1,"forged_for_other":0} | {"status":200,"completed":true,"stored_for_caller":1,"forged_for_other":0} | ✅ PASS |
| **VID-06** compliance shows SENT vs WATCHED — the evidence for a mandatory notice | {"sent":1,"watched":1,"watched_pct":100,"mandatory":true} | {"sent":1,"watched":1,"watched_pct":100,"mandatory":true} | ✅ PASS |
| **VID-07** audience: an empty filter reaches NOBODY (blanket is never the default) | {"empty":0,"by_accommodation_gt0":true,"all_gte_accommodation":true} | {"empty":0,"by_accommodation_gt0":true,"all_gte_accommodation":true} | ✅ PASS |
| **VID-08** drip: a resident housed long before go-live gets day 1 ONLY, never a backlog | {"due_steps":[1],"no_backlog":true} | {"due_steps":[1],"no_backlog":true} | ✅ PASS |
| **VID-09** a step never fires twice for the same person, however often the job runs | {"duplicate_step_sends":0,"first_step_sent_once":1,"capped_at_one_per_day":true} | {"duplicate_step_sends":0,"first_step_sent_once":1,"capped_at_one_per_day":true} | ✅ PASS |
| **VID-10** calendar sequence fires on its month-day and on no other day | {"on_the_day":true,"other_day":0} | {"on_the_day":true,"other_day":0} | ✅ PASS |
| **VID-11** per-day cap holds across ALL sequences a resident is enrolled in | {"max_per_person_today":1} | {"max_per_person_today":1} | ✅ PASS |
| **VID-12** library search + category filter work over the resident's own visible set | {"search_hit":true,"category_filter_works":true,"categories_present":true} | {"search_hit":true,"category_filter_works":true,"categories_present":true} | ✅ PASS |

## AUTOMATIONS — 8 passed / 0 failed

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **AUTO-01** scheduled report run — generates, STORES the xlsx, and accounts for delivery truthfully | {"status":"success","has_records":true,"file_path_set":true,"file_on_disk":true,"recipients_count":1,"delivery_accounting_honest":true} | {"status":"success","has_records":true,"file_path_set":true,"file_on_disk":true,"recipients_count":1,"delivery_accounting_honest":true,"_delivered":1,"_error":null} | ✅ PASS |
| **AUTO-02** FORCED delivery failure — 0/1 recorded on the run and an ops alert raised (never a silent success) | {"status":"success","delivered_count":0,"error_recorded":"~Kézbesítés: 0\\/1~","ops_alert_emitted":true,"file_still_stored":true} | {"status":"success","delivered_count":0,"error_recorded":"Kézbesítés: 0/1 sikeres. Hiba: FUNCTEST forced delivery failure","ops_alert_emitted":true,"file_still_stored":true} | ✅ PASS |
| **AUTO-03** every configured report type executes and stores an output | {"failed_types":[],"stored":6} | {"failed_types":[],"stored":6} | ✅ PASS |
| **AUTO-04** an unknown report type fails LOUDLY (status=failed + error_message), never silently | {"status":"failed","error":"~Unknown report type~"} | {"status":"failed","error":"Unknown report type: ft_nonexistent_type"} | ✅ PASS |
| **AUTO-05** alertOps fires on a forced failure (ops alert emitted, job does not crash) | {"ops_alert_emitted":true,"mentions_report_name":true,"threw":false} | {"ops_alert_emitted":true,"mentions_report_name":true,"threw":false,"_alerts":["[ops-alert] Ütemezett riport HIBA: \"FT Kényszerített hiba\" — Unknown report type: ft_forced_failure"]} | ✅ PASS |
| **AUTO-06** billing draft run — the expected invoice set, all rows in draft status on one run | {"billings":23,"all_draft":true,"run_status":"calculated","rows_match_summary":true} | {"billings":23,"all_draft":true,"run_status":"calculated","rows_match_summary":true} | ✅ PASS |
| **AUTO-07** daily occupancy snapshot cron — the expected number of employee-days for the month | {"rows":15075} | {"rows":15075} | ✅ PASS |
| **AUTO-08** snapshot cron is idempotent — re-running the whole month duplicates nothing | {"rows_unchanged":true,"duplicate_keys":0} | {"rows_unchanged":true,"duplicate_keys":0} | ✅ PASS |

## COMPOSED — 6 passed / 0 failed

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| **COMP-01** billingPerBed.test.js — per-bed formula, pure unit — the owner's worked examples | {"failed":0,"ran":true} | {"failed":0,"ran":true,"_passed":6,"_total":6} | ✅ PASS |
| **COMP-02** billingProfileMatrix.test.js — company/private × taxable/exempt × flat/per_person × invoicing on/off | {"failed":0,"ran":true} | {"failed":0,"ran":true,"_passed":7,"_total":7} | ✅ PASS |
| **COMP-03** billingEngineOptionC.test.js — engine regression — net revenue unchanged | {"failed":0,"ran":true} | {"failed":0,"ran":true,"_passed":1,"_total":1} | ✅ PASS |
| **COMP-04** residentLeakGuards.test.js — DEEP_AUDIT 1-4 route-level guards (mocked layer) | {"failed":0,"ran":true} | {"failed":0,"ran":true,"_passed":32,"_total":32} | ✅ PASS |
| **COMP-05** deductionExecutionMothball.test.js — the deduction executor stays mothballed behind its flag | {"failed":0,"ran":true} | {"failed":0,"ran":true,"_passed":7,"_total":7} | ✅ PASS |
| **COMP-06** damageReportAuthz.test.js — damage-report authz + tenant scope (resident IDOR) | {"failed":0,"ran":true} | {"failed":0,"ran":true,"_passed":27,"_total":27} | ✅ PASS |

---

## ⚠️ Known gaps (11) — documented, not regressions

These assert the CORRECT behaviour. They fail because the feature is missing or
the bug is still open. Each flips to 🎉 FIXED automatically once closed.

| Scenario | Gap | Expected (correct) | Actual (today) |
|---|---|---|---|
| **CONS-13** LOCK constraint — a locked resident must never be proposed for a move | NOT BUILT — engine v1 has no do-not-move flag on employees or agent_suggestions (migs 133–135 are sandbox-only, not in … | {"lock_field_exists":true} | {"lock_field_exists":false} |
| **CONS-14** 60-DAY STABILITY — a resident moved recently must not be moved again inside the window | NOT BUILT — consolidation_config has no stability window and the engine never reads move recency | {"stability_window_days":60,"engine_reads_move_history":true} | {"stability_window_days":null,"engine_reads_move_history":false} |
| **CONS-15** approve → TICKET → confirm → room change (staged lifecycle) | NOT BUILT — applyGroup writes employees.room_id directly in one transaction; no ticket, no confirmation step | {"approve_creates_ticket":true,"room_change_awaits_confirmation":true} | {"approve_creates_ticket":false,"room_change_awaits_confirmation":false} |
| **PERM-14** cross-tenant READ — tenant-1 operator listing employees sees no tenant-2 rows | DEEP_AUDIT #6 — employee.controller.js has no contractor_id filter in list or detail | {"foreign_ids_returned":0} | {"foreign_ids_returned":3,"_status":200} |
| **PERM-15** cross-tenant READ — finance endpoints scope to the caller's contractor | DEEP_AUDIT #7 — expenses / operating-costs / profit reads have no owner filter (accommodation_id is OPTIONAL, so omitti… | {"endpoints_returning_foreign_data":[]} | {"endpoints_returning_foreign_data":["/expenses → 200","/profit/by-accommodation?month=19… |
| **PERM-16** timesheets — one tenant cannot read another tenant's logged hours by task id | DEEP_AUDIT #8 — timesheet.controller.js getByTask is WHERE ts.task_id = $1 with no tenant check, and returns each logge… | {"rows_returned":0,"foreign_email_exposed":false} | {"rows_returned":1,"foreign_email_exposed":true,"_status":200} |
| **PERM-17** GET /rooms/:id/inspection-history requires a permission | DEEP_AUDIT #11 — rooms.routes.js:10 has no checkPermission and filters only by room_id | {"resident_status":403} | {"resident_status":200} |
| **PERM-18** GET /analytics/overview requires a permission | DEEP_AUDIT #12 — analytics.routes.js:13 serves whole-company BI to any authenticated user | {"resident_status":403} | {"resident_status":200} |
| **REP-13** employees report — Email/Telefon come from the EMPLOYEE record, not the login | DEEP_AUDIT #14 — report-scheduler.service.js:32-33 selects u.email/u.phone; company_email/personal_email are never read | {"email":"report.subject@functest.local","phone":"+36 30 000 1234"} | {"email":"","phone":""} |
| **REP-14** cost_centers report honours its configured filters | DEEP_AUDIT #17 — generateCostSummaryData() takes no filters argument but is called generator(filters) | {"filter_changed_output":true} | {"filter_changed_output":false,"_unfiltered_rows":16,"_filtered_rows":16} |
| **REP-15** occupancy report "as of" uses the LOCAL date, not UTC | DEEP_AUDIT #18 — report-scheduler.service.js:187 uses new Date().toISOString().slice(0,10) | {"tz_probe_occupied":1} | {"tz_probe_occupied":0} |

---

_Generated by `tests/functest/` — 121 passed / 0 failed / 11 known-gap. Regenerate with `npm run functest`._
