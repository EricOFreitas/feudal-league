'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Recarrega os dados do servidor a cada N segundos enquanto montado (análise em andamento). */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
