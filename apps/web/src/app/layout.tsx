import type { ReactNode } from 'react';

// O layout real fica em [locale]/layout.tsx. Este só existe pra o Next ter um root layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
