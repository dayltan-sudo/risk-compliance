export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-[var(--card)] border border-[var(--line)] rounded-xl shadow-[var(--shadow-sm)] p-6 ${className}`}>{children}</div>;
}

export function SectionHeading({ eyebrow, title, dek }: { eyebrow?: string; title: string; dek?: string }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="font-mono text-[10.5px] font-semibold tracking-wider uppercase text-[var(--muted)] mb-1.5">{eyebrow}</p>}
      <h2 className="font-serif-heading text-lg font-semibold tracking-tight">{title}</h2>
      {dek && <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">{dek}</p>}
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
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium transition-all duration-100 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const variants: Record<string, string> = {
    primary: "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--accent-deep)]",
    secondary: "bg-[var(--card)] border border-[var(--line)] text-[var(--ink)] shadow-[var(--shadow-sm)] hover:border-[var(--line-strong)] hover:bg-[var(--paper)]",
    danger: "bg-[var(--crit)] text-white shadow-[var(--shadow-sm)] hover:opacity-90",
    ghost: "text-[var(--accent-deep)] hover:bg-[var(--accent-tint)]",
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
