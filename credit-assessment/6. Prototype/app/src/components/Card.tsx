export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-[var(--card)] border border-[var(--line)] rounded-xl p-5 ${className}`}>{children}</div>;
}

export function SectionHeading({ eyebrow, title, dek }: { eyebrow?: string; title: string; dek?: string }) {
  return (
    <div className="mb-4">
      {eyebrow && <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-[var(--accent)] mb-1">{eyebrow}</p>}
      <h2 className="font-serif-heading text-xl font-semibold">{title}</h2>
      {dek && <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">{dek}</p>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const base = "px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-deep)]",
    secondary: "bg-[var(--card)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]",
    danger: "bg-[var(--crit)] text-white hover:opacity-90",
    ghost: "text-[var(--accent-deep)] hover:bg-[var(--accent-tint)]",
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}
