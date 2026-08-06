import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { dadosDaTela } from "@/modules/certidoes/queries";
import { panoramaCompliance, tiposObrigatoriosFaltantes } from "@/modules/certidoes/service";
import { ACAO_LABEL } from "@/modules/auditoria/labels";
import { CertidoesView } from "@/components/certidoes/certidoes-view";

export const metadata: Metadata = { title: "Certidões" };

export default async function CertidoesPage() {
  const user = await requirePermission("certidoes", "ver");
  const podeGerir = await can(user.role, "certidoes", "gerir");

  const { certidoes, tipos, responsaveisPossiveis, links, auditLogs, habilitacoes, versaoIdParaCertidaoId, nomeDoUsuario } =
    await dadosDaTela();

  const habilitacoesPorCertidao = new Map<string, typeof habilitacoes>();
  for (const h of habilitacoes) {
    if (!h.certidaoId) continue;
    const lista = habilitacoesPorCertidao.get(h.certidaoId) ?? [];
    lista.push(h);
    habilitacoesPorCertidao.set(h.certidaoId, lista);
  }

  const auditoriaPorCertidao = new Map<string, typeof auditLogs>();
  for (const a of auditLogs) {
    if (!a.entidadeId) continue;
    const certidaoId = a.entidade === "Certidao" ? a.entidadeId : versaoIdParaCertidaoId.get(a.entidadeId);
    if (!certidaoId) continue;
    const lista = auditoriaPorCertidao.get(certidaoId) ?? [];
    lista.push(a);
    auditoriaPorCertidao.set(certidaoId, lista);
  }

  const certidoesUI = certidoes.map((c) => ({
    id: c.id,
    tipoId: c.tipoId,
    tipo: c.tipo.nome,
    descricao: c.descricao,
    validade: c.validade.toISOString().slice(0, 10),
    arquivoNome: c.arquivoNome,
    responsavelId: c.responsavelId,
    responsavelNome: c.responsavel?.name ?? null,
    versoes: c.versoes.map((v) => ({
      id: v.id,
      numero: v.numero,
      validade: v.validade.toISOString().slice(0, 10),
      arquivoNome: v.arquivoNome,
      data: v.createdAt.toISOString(),
    })),
    licitacoes: (habilitacoesPorCertidao.get(c.id) ?? []).map((h) => ({
      licitacaoId: h.licitacao.id,
      titulo: h.licitacao.titulo,
      status: h.licitacao.status,
      exigencia: h.exigencia,
      atendido: h.atendido,
    })),
    auditoria: (auditoriaPorCertidao.get(c.id) ?? []).map((a) => ({
      id: a.id,
      acao: ACAO_LABEL[a.acao] ?? a.acao,
      resultado: a.resultado,
      usuario: (a.userId && nomeDoUsuario.get(a.userId)) ?? null,
      data: a.createdAt.toISOString(),
    })),
  }));

  const panorama = panoramaCompliance(
    certidoes.map((c) => ({ id: c.id, tipoId: c.tipoId, validade: c.validade.toISOString().slice(0, 10), arquivoPath: c.arquivoPath })),
  );
  const faltando = tiposObrigatoriosFaltantes(
    tipos,
    certidoes.map((c) => ({ tipoId: c.tipoId, validade: c.validade.toISOString().slice(0, 10) })),
  );

  return (
    <CertidoesView
      certidoes={certidoesUI}
      tipos={tipos}
      responsaveis={responsaveisPossiveis}
      links={links.map((l) => ({
        id: l.id,
        token: l.token,
        ativo: l.ativo,
        expiraEm: l.expiraEm ? l.expiraEm.toISOString() : null,
        certidaoIds: l.certidaoIds,
        createdAt: l.createdAt.toISOString(),
      }))}
      panorama={panorama}
      faltando={faltando}
      podeGerir={podeGerir}
    />
  );
}
