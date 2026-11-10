/** Texto com os links http(s) clicáveis (abrem em outra aba). O resto sai como texto puro. */
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-gold-300">{p}</a>
        : <span key={i}>{p}</span>))}
    </>
  );
}
