/** Bandeira em emoji a partir do código ISO de 2 letras. */
export function Flag({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!code || code.length !== 2) return <span className={className} aria-hidden>·</span>;
  const cc = code.toUpperCase();
  const emoji = String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return <span className={className} title={cc} aria-label={cc}>{emoji}</span>;
}
