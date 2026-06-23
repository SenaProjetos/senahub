import { Quote } from "lucide-react";

/**
 * Bloco da citação do dia — sempre exibido (fixo).
 * A geração/rotação da frase vive em `@/lib/frase-do-dia` e não é alterada aqui.
 * `light` adapta as cores para o fundo do céu animado (dia = texto escuro, noite = claro).
 */
export function HeroCitacao({ frase, autor, light }: { frase: string; autor: string; light?: boolean }) {
  const quoteCor = light ? "text-neutral-700" : "text-slate-200/80";
  const fraseCor = light ? "text-neutral-900" : "text-slate-50";
  const autorCor = light ? "text-neutral-600" : "text-slate-300";

  return (
    <figure className="relative mt-5 flex max-w-2xl items-start gap-3">
      <Quote className={`mt-0.5 size-5 shrink-0 ${quoteCor}`} />
      <div>
        <blockquote className={`text-sm leading-relaxed ${fraseCor}`}>{frase}</blockquote>
        <figcaption className={`mt-1 text-xs ${autorCor}`}>— {autor}</figcaption>
      </div>
    </figure>
  );
}
