export function formatCurrency(value: number | null, currency = "USD"): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatRatio(value: number | null, ratioKey?: string): string {
  if (value === null) return "—";
  if (ratioKey && ["gross_margin", "net_margin", "roe", "roa", "gearing"].includes(ratioKey)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (ratioKey && ["dso", "dpo", "dio"].includes(ratioKey)) {
    return `${value.toFixed(0)}d`;
  }
  return `${value.toFixed(2)}x`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
