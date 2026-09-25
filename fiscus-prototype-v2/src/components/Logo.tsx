export function Logomark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[8px] bg-[var(--accent)] shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M4 17L9.5 11L13.5 15L20 7" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14.5 7H20V12.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
