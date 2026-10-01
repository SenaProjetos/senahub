import { redirect } from "next/navigation";
import { exigirAcessoNomenclatura } from "@/modules/projetos/nomenclatura/acesso";
import { numerosDasVersoes } from "@/modules/projetos/nomenclatura/catalogo/queries";

/** A tela de nomenclatura abre na versão mais nova (a que está sendo preparada) — spec 2026-09-30, E1. */
export default async function NomenclaturaRaizPage() {
  await exigirAcessoNomenclatura();
  const numeros = await numerosDasVersoes();
  redirect(`/configuracoes/nomenclatura/${numeros.length > 0 ? Math.max(...numeros) : 1}`);
}
