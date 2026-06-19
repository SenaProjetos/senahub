import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listarSancoesProprias, listarSancoesConcorrentes } from "@/modules/licitacoes/sancoes/queries";
import { SancoesView } from "@/components/licitacoes/sancoes-view";

export const metadata: Metadata = { title: "Sanções" };

export default async function SancoesPage() {
  const user = await requirePermission("licitacoes", "ver");
  const podeGerir = await can(user.role, "licitacoes", "gerir");
  const [proprias, concorrentes, fornecedores] = await Promise.all([
    listarSancoesProprias(),
    listarSancoesConcorrentes(),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  return (
    <SancoesView
      podeGerir={podeGerir}
      fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
      proprias={proprias.map((s) => ({
        id: s.id,
        tipo: s.tipo,
        valor: s.valor != null ? Number(s.valor) : null,
        inicio: s.inicio ? s.inicio.toISOString().slice(0, 10) : "",
        fim: s.fim ? s.fim.toISOString().slice(0, 10) : "",
        orgao: s.orgao ?? "",
        processo: s.processo ?? "",
        observacao: s.observacao ?? "",
      }))}
      concorrentes={concorrentes.map((s) => ({
        id: s.id,
        fornecedorId: s.fornecedorId ?? "",
        fornecedorNome: s.fornecedor ? s.fornecedor.nome : null,
        nomeLivre: s.nomeLivre ?? "",
        tipo: s.tipo,
        valor: s.valor != null ? Number(s.valor) : null,
        inicio: s.inicio ? s.inicio.toISOString().slice(0, 10) : "",
        fim: s.fim ? s.fim.toISOString().slice(0, 10) : "",
        orgao: s.orgao ?? "",
        processo: s.processo ?? "",
        observacao: s.observacao ?? "",
      }))}
    />
  );
}
