import { fraseDoDia } from "@/lib/frase-do-dia";
import { HeroCardAnimado } from "@/components/dashboard/hero-card-animado";

/**
 * Wrapper server: resolve a frase do dia (server-only) e delega a renderização
 * para o herocard animado (client), que controla o céu/hora ao vivo.
 */
export function HeroCard({ nome }: { nome: string }) {
  const frase = fraseDoDia();
  const primeiro = nome.split(" ")[0];

  return <HeroCardAnimado nome={primeiro} frase={frase.frase} autor={frase.autor} />;
}
