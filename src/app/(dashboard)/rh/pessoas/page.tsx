import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarPessoas } from "@/modules/rh/pessoas/queries";
import { alteracoesPendentes } from "@/modules/rh/cadastro/queries";
import { PessoasLista } from "@/components/rh/pessoas-lista";
import { PendenciasCadastro } from "@/components/rh/pendencias-cadastro";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PessoasPage() {
  await requirePermission("rh", "cadastro");
  const [pessoas, pendencias] = await Promise.all([listarPessoas(), alteracoesPendentes()]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Pessoas</h1>
        <p className="text-sm text-muted-foreground">
          Ficha única de cada pessoa — cadastro, ausências, escala, banco de horas e acesso num só lugar.
        </p>
      </div>
      <PendenciasCadastro pendencias={pendencias} />
      <PessoasLista pessoas={pessoas} />
    </div>
  );
}
