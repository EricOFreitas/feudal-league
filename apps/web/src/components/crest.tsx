/** Brasão próprio do portal (SVG autoral, não é asset do jogo). */
export function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crest-gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e9cf8a" />
          <stop offset="1" stopColor="#8a6424" />
        </linearGradient>
      </defs>
      <path d="M32 3 L56 11 V30 C56 45 45 55 32 61 C19 55 8 45 8 30 V11 Z" fill="#1b140e" stroke="url(#crest-gold)" strokeWidth="2.5" />
      <path d="M32 9 L50 15 V30 C50 41 42 49 32 54 C22 49 14 41 14 30 V15 Z" fill="none" stroke="#b8893a" strokeWidth="1" opacity="0.6" />
      <path d="M22 40 V26 h4 v-4 h4 v4 h4 v-4 h4 v4 h4 v14 Z" fill="url(#crest-gold)" />
      <rect x="30" y="31" width="4" height="9" fill="#1b140e" />
    </svg>
  );
}
