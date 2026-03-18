/**
 * Shared helpers for WellMind data normalization.
 * Maps backend values to frontend display values.
 */
import { colors } from '../../constants/colors';

// ─── Health Status Mapping ──────────────────────────────────
// Backend returns: 'healthy' | 'needs_attention' | 'at_risk'
// Assessment risk_level returns: 'green' | 'yellow' | 'red'

const STATUS_MAP = {
  healthy: 'green',
  needs_attention: 'yellow',
  at_risk: 'red',
  // passthrough for assessment risk_level
  green: 'green',
  yellow: 'yellow',
  red: 'red',
};

const RISK_COLORS = {
  green: colors.success,
  yellow: colors.warning,
  red: colors.error,
};

const RISK_LABELS = {
  green: 'Alacsony',
  yellow: 'Közepes',
  red: 'Magas',
};

/**
 * Normalize backend health_status or risk_level to green/yellow/red.
 */
export function normalizeRisk(status) {
  return STATUS_MAP[status] || 'yellow';
}

/**
 * Get color for a risk level.
 */
export function riskColor(status) {
  return RISK_COLORS[normalizeRisk(status)] || colors.warning;
}

/**
 * Get Hungarian label for a risk level.
 */
export function riskLabel(status) {
  return RISK_LABELS[normalizeRisk(status)] || 'Ismeretlen';
}

/**
 * Safely parse a numeric value from backend (may be string or number).
 */
export function num(value, fallback = 0) {
  if (value == null) return fallback;
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Get burnout color based on score.
 */
export function burnoutColor(score) {
  const s = num(score);
  if (s > 70) return colors.error;
  if (s > 50) return colors.warning;
  return colors.success;
}

/**
 * Get engagement color based on score (inverted — low is bad).
 */
export function engagementColor(score) {
  const s = num(score);
  if (s < 40) return colors.error;
  if (s < 60) return colors.warning;
  return colors.success;
}
