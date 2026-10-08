import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { requireInterno } from "@/lib/session";
import { minhaEquipe } from "@/modules/rh/desenvolvimento/queries";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { EmptyState } from "@/components/ui/empty-state";
import { dataCurta } from "@/lib/dias-iso";

export const metadata: Metadata = { title: "Minha equipe" };

/**
 * Visão limitada de quem lidera (F3): só o desenvolvimento dos liderados ATIVOS — sem ficha
 * completa, salário ou documentos. O acesso vem da relação de liderança, não de setor ou cargo.
 */
export default async function MinhaEquipePage() {
  const user = await requireInterno();
  const equipe = await minhaEquipe(user.id);
  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Minha equipe" descricao="Objetivos e encontros 1:1 de quem você lidera." />
      {equipe.length === 0 ? (
        <EmptyState icon={Users} title="Você não lidera ninguém" description="A liderança direta é definida pelo RH na ficha da pessoa." />
      ) : (
        <ul className="divide-y rounded-sm border">
          {equipe.map((p) => (
            <li key={p.userId}>
              <Link href={`/rh/minha-equipe/${p.userId}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                <AvatarUsuario nome={p.nome} image={p.image} size="sm" className="size-8 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{p.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.objetivosAbertos} objetivo(s) em andamento · último 1:1 {p.ultimo1a1 ? dataCurta(p.ultimo1a1) : "nunca"}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${p.proximo.vencido ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {p.proximo.vencido ? `1:1 atrasado ${p.proximo.diasAtraso} dia(s)` : `próximo 1:1 até ${dataCurta(p.proximo.em)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
