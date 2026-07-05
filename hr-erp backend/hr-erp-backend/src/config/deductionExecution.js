/**
 * Salary-deduction EXECUTION — feature flag (mothballed by default).
 *
 * DECISION (2026-07-05): Legally we only PRODUCE the damage jegyzőkönyv; the
 * client's own payroll executes any deductions. Our deduction-execution engine
 * is therefore MOTHBALLED — reversibly, not demolished — so it can be re-enabled
 * for a future EOR (Employer-of-Record) model where WE run payroll.
 *
 * When OFF (default / prod today):
 *   • the manual payroll trigger (POST /fines/payroll/run) → 403
 *   • scheduling a new salary deduction (POST /compensations/:id/salary-deduction) → 403
 *   • converting an overdue balance to a deduction (POST /fines/residents/:id/convert-to-deduction) → 403
 *   • the daily auto-conversion (inspectionAutomation → runAutoConversions) is skipped
 *   • the monthly payroll cron is NOT scheduled
 * The underlying service engine (processMonthlyDeductions, convertToSalaryDeduction,
 * scheduleSalaryDeduction, runAutoConversions) stays intact and callable.
 *
 * KEEP working regardless of this flag: on-site / cash repayments, the
 * compensation_payments ledger for cash, payment-history reads, and the
 * jegyzőkönyv PDF (incl. its payment_plan section).
 *
 * TO RE-ENABLE (future EOR): set env `DEDUCTION_EXECUTION_ENABLED=true` and
 * restart the backend. No code change, no migration. The monthly cron will then
 * schedule + run live and the three endpoints will process again.
 */
function isDeductionExecutionEnabled() {
  return process.env.DEDUCTION_EXECUTION_ENABLED === 'true';
}

// Standard Hungarian 403 body for a blocked execution endpoint.
const DEDUCTION_DISABLED_MESSAGE =
  'A bérlevonás végrehajtása ki van kapcsolva. A folyamatunk a kártérítési '
  + 'jegyzőkönyv átadásával lezárul; a levonást az ügyfél bérszámfejtése végzi. '
  + '(Jövőbeli EOR-modellhez a DEDUCTION_EXECUTION_ENABLED kapcsolóval újraaktiválható.)';

module.exports = { isDeductionExecutionEnabled, DEDUCTION_DISABLED_MESSAGE };
