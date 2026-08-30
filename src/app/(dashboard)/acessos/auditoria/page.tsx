import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { listarAuditoria } from "@/modules/auditoria/queries";
import { AuditoriaTabela } from "@/components/auditoria/auditoria-tabela";

export const metadata: Metadata = { title: "Histórico do cofre de acessos" };

/**
 * §87 — histórico de auditoria do cofre.
 *
 * Existe separada de `/auditoria` por causa da PERMISSÃO, não do conteúdo: aquela exige
 * `role === "admin"`, e §87 fala em "usuários autorizados" — quem administra o cofre precisa
 * auditar o cofre sem ganhar a trilha do sistema inteiro junto. Daí o gate `acessos:auditoria`.
 *
 * Reusa `listarAuditoria` e `AuditoriaTabela` com o módulo fixado; nada de tabela nem tela
 * paralela (§66). O filtro de módulo some da UI porque aqui ele não é escolha — é o recorte.
 */
export default async function AuditoriaAcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string; q?: string; de?: string; ate?: string; page?: string }>;
}) {
  await requirePermission("acessos", "auditoria");
  const sp = await searchParams;

  const data = await listarAuditoria({
    modulo: "acessos",
    resultado: sp.resultado,
    q: sp.q,
    de: sp.de,
    ate: sp.ate,
    page: sp.page ? Number(sp.page) : 1,
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <Link
          href="/acessos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar para Acessos
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Histórico do cofre</h1>
        <p className="text-sm text-muted-foreground">
          Quem revelou, copiou ou alterou cada acesso. {data.total} eventos registrados.
        </p>
      </div>

      {/* `modulos: []` esconde o seletor de módulo: aqui ele está fixo em "acessos", e oferecer
          a troca sugeriria que dá para sair do recorte — o que a permissão não permite. */}
      <AuditoriaTabela data={{ ...data, modulos: [] }} filtro={{ ...sp, modulo: "acessos" }} />
    </div>
  );
}
