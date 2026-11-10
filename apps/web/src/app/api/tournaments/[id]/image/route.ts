import { tournamentImage } from '@aoe2/sync';

/** Imagem do torneio. A página põe ?v=<data da imagem> na URL, então o cache pode ser longo. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 404 });
  const img = await tournamentImage(id);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      'content-type': img.contentType,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
