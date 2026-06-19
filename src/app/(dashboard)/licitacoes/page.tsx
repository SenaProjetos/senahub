import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarClientes } from "@/modules/clientes/queries";
import { nomesModalidadesAtivas } from "@/modules/licitacoes/modalidades/queries";
import { listarLicitacoes } from "@/modules/licitacoes/queries";
import { listarChecklistModelos } from "@/modules/licitacoes/habilitacao/queries";
import { listarResponsaveisTecnicos } from "@/modules/licitacoes/tecnico/queries";
import { listarSancoesProprias } from "@/modules/licitacoes/sancoes/queries";
import { sancaoAtiva } from "@/modules/licitacoes/sancoes/sancoes";
import { prisma } from "@/lib/prisma";
import { LicitacoesView } from "@/components/licitacoes/licitacoes-view";

export const metadata: Metadata = { title: "Licitações" };

export default async function LicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    orgao?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requirePermission("licitacoes", "ver");
  const podeGerir = await can(user.role, "licitacoes", "gerir");
  const sp = await searchParams;

  const filtro = {
    status: sp.status ? sp.status.split(",").filter(Boolean) : [],
    orgao: sp.orgao ?? "",
    q: sp.q ?? "",
    page: sp.page ? Number(sp.page) : 1,
    pageSize: sp.pageSize ? Number(sp.pageSize) : undefined,
  };

  const [data, clientes, modalidades, modelos, certidoes, rts, fornecedores, proprias] = await Promise.all([
    listarLicitacoes(filtro),
    listarClientes({ incluirInativos: false }),
    nomesModalidadesAtivas(),
    listarChecklistModelos(false),
    prisma.certidao.findMany({ include: { tipo: true }, orderBy: { validade: "desc" } }),
    listarResponsaveisTecnicos(false),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listarSancoesProprias(),
  ]);

  const hojeISO = new Date().toISOString().slice(0, 10);
  const sancoesPropriasAtivas = proprias.filter((s) =>
    sancaoAtiva(
      {
        inicio: s.inicio ? s.inicio.toISOString().slice(0, 10) : null,
        fim: s.fim ? s.fim.toISOString().slice(0, 10) : null,
      },
      hojeISO,
    ),
  ).length;

  return (
    <LicitacoesView
      podeGerir={podeGerir}
      modalidades={modalidades}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      licitacoes={data.rows}
      total={data.total}
      page={data.page}
      pages={data.pages}
      pageSize={data.pageSize}
      filtro={{ status: filtro.status, orgao: filtro.orgao, q: filtro.q }}
      modelosHabilitacao={modelos.map((m) => ({ id: m.id, nome: m.nome }))}
      certidoes={certidoes.map((c) => ({
        id: c.id,
        nome: c.descricao ? `${c.tipo.nome} — ${c.descricao}` : c.tipo.nome,
        validade: c.validade.toISOString().slice(0, 10),
      }))}
      responsaveisTecnicos={rts.map((r) => ({ id: r.id, nome: r.nome, registro: r.registro, conselho: r.conselho }))}
      fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
      sancoesPropriasAtivas={sancoesPropriasAtivas}
    />
  );
}
