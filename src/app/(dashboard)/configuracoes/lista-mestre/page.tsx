import { redirect } from "next/navigation";
import { numerosDasVersoes } from "@/modules/projetos/nomenclatura/catalogo/queries";

/**
 * A Lista Mestre global virou as abas Fases, Tipos e Formatos de folha da tela única (spec
 * 2026-09-30, §6). Vai para a versão mais nova; sem versão cadastrada, para a lente "Todas" (nunca
 * para a raiz, que redireciona de novo). Redirecionamento temporário: o destino muda a cada versão
 * nova, e um 308 ficaria guardado no navegador apontando para a versão antiga.
 */
export default async function ListaMestreConfigPage() {
  const numeros = await numerosDasVersoes();
  const lente = numeros.length > 0 ? Math.max(...numeros) : "todas";
  redirect(`/configuracoes/nomenclatura/${lente}?aba=fases`);
}
