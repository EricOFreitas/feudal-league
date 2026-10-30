import type { DiscordEmbed } from '@aoe2/sync';
import { Crest } from './crest';

/** Negrito do Markdown do Discord (**x**) e quebras de linha, só o que os avisos usam. */
function rich(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold text-[#f2f2f2]">{part.slice(2, -2)}</strong> : part,
  );
}

/** Cartão que imita uma mensagem de webhook no Discord: avatar, nome + APP, embed com barra colorida. */
export function DiscordPreviewCard({ embed, time }: { embed: DiscordEmbed; time: string }) {
  const hex = `#${embed.color.toString(16).padStart(6, '0')}`;
  return (
    <div className="flex gap-2.5 rounded border border-[#2a2622] bg-[#121110] p-3 font-sans">
      <Crest className="h-8 w-8 flex-none" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-[0.82rem]">
          <strong className="font-semibold text-[#f2f2f2]">Feudal League</strong>
          <span className="rounded-[3px] bg-[#3a3a3a] px-1 text-[0.65rem] text-[#ddd]">APP</span>
          <span className="text-[0.72rem] text-[#8a8a8a]">{time}</span>
        </div>
        <div className="mt-1.5 rounded-[3px] border-l-4 bg-[#1b1a19] px-2.5 py-2 text-[0.82rem] leading-snug text-[#d6d6d6]" style={{ borderLeftColor: hex }}>
          <div className="font-semibold text-[#f2f2f2]">{embed.title}</div>
          <div className="mt-1 whitespace-pre-line">{rich(embed.description)}</div>
          <div className="mt-1.5 text-[0.72rem] text-[#8a8a8a]">{embed.footer.text}</div>
        </div>
      </div>
    </div>
  );
}
