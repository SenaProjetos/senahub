import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listarClientes } from "@/modules/clientes/queries";
import { nomesModalidadesAtivas } from "@/modules/licitacoes/modalidades/queries";
import { obterLicitacao } from "@/modules/licitacoes/queries";
import { listarChecklistModelos } from "@/modules/licitacoes/habilitacao/queries";
import { listarResponsaveisTecnicos } from "@/modules/licitacoes/tecnico/queries";
import { listarSancoesProprias } from "@/modules/licitacoes/sancoes/queries";
import { sancaoAtiva } from "@/modules/licitacoes/sancoes/sancoes";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { LicitacaoDetailView } from "@/components/licitacoes/licitacao-detail-view";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";

export const metadata: Metadata = { title: "Licitação" };

export default async function LicitacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("licitacoes", "ver");
  const podeGerir = await can(user.role, "licitacoes", "gerir");
  const { id } = await params;

  const lic = await obterLicitacao(id);
  if (!lic) notFound();

  const [clientes, modalidades, modelos, certidoes, rts, fornecedores, proprias, modelosDoc] =
    await Promise.all([
      listarClientes({ incluirInativos: false }),
      nomesModalidadesAtivas(),
      listarChecklistModelos(false),
      prisma.certidao.findMany({ include: { tipo: true }, orderBy: { validade: "desc" } }),
      listarResponsaveisTecnicos(false),
      prisma.fornecedor.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      listarSancoesProprias(),
      modelosPorFonte("licitacao"),
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/licitacoes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Licitações
        </Link>
        <GerarDocumentoButton modelos={modelosDoc} paramId="licitacaoId" valor={id} />
      </div>
      <LicitacaoDetailView
        lic={lic}
        podeGerir={podeGerir}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
        modalidades={modalidades}
        modelosHabilitacao={modelos.map((m) => ({ id: m.id, nome: m.nome }))}
        certidoes={certidoes.map((c) => ({
          id: c.id,
          nome: c.descricao ? `${c.tipo.nome} — ${c.descricao}` : c.tipo.nome,
          validade: c.validade.toISOString().slice(0, 10),
        }))}
        responsaveisTecnicos={rts.map((r) => ({
          id: r.id,
          nome: r.nome,
          registro: r.registro,
          conselho: r.conselho,
        }))}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
        sancoesPropriasAtivas={sancoesPropriasAtivas}
      />
    </div>
  );
}
