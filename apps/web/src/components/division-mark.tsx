/** Ícone próprio por divisão (nada do jogo). Traço em ouro sobre fundo transparente. */
export function DivisionMark({ nameKey, className = 'h-6 w-6' }: { nameKey: string | null; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (nameKey) {
      case 'shield': return <path {...p} d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5L12 3z" />;
      case 'lance': return <><path {...p} d="M5 19L17 7" /><path {...p} d="M14 4l6 6-3 1-4-4 1-3z" /><path {...p} d="M7 13l4 4" /></>;
      case 'banner': return <><path {...p} d="M6 3v18" /><path {...p} d="M6 4h12l-3 4 3 4H6" /></>;
      case 'tower': return <><path {...p} d="M7 21V8h10v13" /><path {...p} d="M7 8V5h2v2h2V5h2v2h2V5h2v3" /><path {...p} d="M11 21v-4h2v4" /></>;
      case 'castle': return <><path {...p} d="M3 21V9h4V6h2v3h6V6h2v3h4v12" /><path {...p} d="M10 21v-5h4v5" /><path {...p} d="M3 13h18" /></>;
      case 'crown': return <><path {...p} d="M4 18h16l1-10-5 4-4-6-4 6-5-4 1 10z" /><path {...p} d="M4 21h16" /></>;
      default: return <circle {...p} cx="12" cy="12" r="7" />;
    }
  })();
  return <svg viewBox="0 0 24 24" className={className} aria-hidden>{body}</svg>;
}
