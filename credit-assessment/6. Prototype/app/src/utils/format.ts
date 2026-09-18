import type { RatioKey } from "../types";

export function formatCurrency(value: number | null, currency = "SGD"): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-SG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

const RATIO_DISPLAY: Record<RatioKey, "currency" | "x" | "pct" | "years" | "none"> = {
  working_capital: "currency",
  current_ratio: "x",
  net_profit_margin: "pct",
  debt_to_equity: "x",
  wc_over_revenue: "pct",
  paid_up_capital_cover: "x",
  profitability_history: "none",
  years_established: "years",
};

export function formatRatioValue(value: number | null, ratioKey: RatioKey, currency = "SGD"): string {
  if (value === null) return "—";
  const kind = RATIO_DISPLAY[ratioKey];
  if (kind === "currency") return formatCurrency(value, currency);
  if (kind === "pct") return `${(value * 100).toFixed(1)}%`;
  if (kind === "years") return `${value.toFixed(1)} yrs`;
  if (kind === "x") return `${value.toFixed(2)}x`;
  return String(value);
}

export function formatChangePct(value: number | null): string {
  if (value === null) return "—";
  const pct = (value * 100).toFixed(1);
  return `${value >= 0 ? "+" : ""}${pct}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric" });
}
