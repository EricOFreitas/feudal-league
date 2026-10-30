'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

/** Volta no histórico; se não houver, vai pro href pai. */
export function BackButton({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push(fallback); }}
      className="btn btn-ghost !px-3 !py-1.5 !text-xs"
    >
      <ArrowLeft className="h-3.5 w-3.5" />{label}
    </button>
  );
}
