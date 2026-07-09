import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarPessoas } from "@/modules/rh/pessoas/queries";
import { PessoasLista } from "@/components/rh/pessoas-lista";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PessoasPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const pessoas = await listarPessoas();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Pessoas</h1>
        <p className="text-sm text-muted-foreground">
          Ficha única de cada pessoa — cadastro, ausências, escala, banco de horas e acesso num só lugar.
        </p>
      </div>
      <PessoasLista pessoas={pessoas} />
    </div>
  );
}
