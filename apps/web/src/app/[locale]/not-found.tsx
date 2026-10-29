import { Link } from '@/i18n/navigation';

export default function NotFound() {
  return (
    <div className="panel mx-auto max-w-md p-8 text-center">
      <p className="stat-num text-6xl">404</p>
      <p className="mt-2 text-parchment-200">Nada por aqui. / Nothing here.</p>
      <Link href="/" className="btn btn-ghost mt-6">←</Link>
    </div>
  );
}
