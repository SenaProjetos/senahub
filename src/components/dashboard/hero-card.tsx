import { fraseDoDia } from "@/lib/frase-do-dia";
import { HeroCardAnimado } from "@/components/dashboard/hero-card-animado";
import type { Aniversariante } from "@/modules/dashboard/queries";
import type { DadosDoHero } from "@/modules/dashboard/hero/queries";

/**
 * Wrapper server: resolve a frase do dia (server-only) e delega a renderização
 * para o herocard animado (client), que controla o céu/hora ao vivo, a faixa do dia
 * (`dia`, lido no Início) e o painel lateral.
 */
export function HeroCard({
  nome,
  aniversariantes,
  humorAtual,
  dia,
}: {
  nome: string;
  aniversariantes: { doDia: Aniversariante[]; doMes: Aniversariante[] };
  humorAtual: number | null;
  dia: DadosDoHero;
}) {
  const frase = fraseDoDia();
  const primeiro = nome.split(" ")[0];

  return (
    <HeroCardAnimado
      nome={primeiro}
      frase={frase.frase}
      autor={frase.autor}
      aniversariantes={aniversariantes}
      humorAtual={humorAtual}
      dia={dia}
    />
  );
}
