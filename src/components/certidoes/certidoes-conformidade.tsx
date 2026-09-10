"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Certidao } from "@/components/certidoes/tipos";
import type { TipoObrigatorio } from "@/modules/certidoes/service";
import { statusCertidao } from "@/modules/certidoes/service";

/**
 * §4 — o alerta de conformidade, agora acionável.
 *
 * O anterior só listava os nomes dos tipos obrigatórios sem vigente. Este conta as pendências por
 * MOTIVO (vencida / sem documento / nunca cadastrada) e leva direto para elas.
 *
 * "Obrigatória" vem sempre de `CertidaoTipo.obrigatoria` — não existe obrigatoriedade por certidão
 * no modelo, então um tipo obrigatório sem NENHUMA certidão registrada também é pendência, e é a
 * única que não tem linha na tabela para apontar.
 */
export function CertidoesConformidade({
  certidoes,
  faltando,
  onVerPendencias,
}: {
  certidoes: Certidao[];
  /** Tipos obrigatórios sem certidão vigente (calculado no servidor). */
  faltando: TipoObrigatorio[];
  onVerPendencias: () => void;
}) {
  const obrigatorias = certidoes.filter((c) => c.obrigatoria);
  const vencidas = obrigatorias.filter((c) => statusCertidao(c.validade) === "vencida");
  const semDocumento = obrigatorias.filter((c) => !c.arquivoNome);
  const semResponsavel = obrigatorias.filter(
    (c) => !c.responsavelNome && statusCertidao(c.validade) !== "ok",
  );

  // Tipos obrigatórios que não têm nenhuma certidão cadastrada (nem vencida) — `faltando` inclui
  // os que só têm vencidas, então descontamos os que já aparecem como linha na tabela.
  const tiposComCertidao = new Set(obrigatorias.map((c) => c.tipoId));
  const nuncaCadastradas = faltando.filter((t) => !tiposComCertidao.has(t.id));

  const motivos = [
    vencidas.length > 0 && `${vencidas.length} ${vencidas.length === 1 ? "está vencida" : "estão vencidas"}`,
    semDocumento.length > 0 &&
      `${semDocumento.length} ${semDocumento.length === 1 ? "está sem documento" : "estão sem documento"}`,
    semResponsavel.length > 0 &&
      `${semResponsavel.length} ${semResponsavel.length === 1 ? "está sem responsável" : "estão sem responsável"}`,
    nuncaCadastradas.length > 0 &&
      `${nuncaCadastradas.length} ${nuncaCadastradas.length === 1 ? "nunca foi cadastrada" : "nunca foram cadastradas"}`,
  ].filter((m): m is string => typeof m === "string");

  // Uma certidão pode entrar em mais de um motivo (vencida E sem documento) — o título conta
  // CERTIDÕES distintas, não somas de motivos, senão "3 obrigatórias" com 2 registros mentiria.
  const idsPendentes = new Set([
    ...vencidas.map((c) => c.id),
    ...semDocumento.map((c) => c.id),
    ...semResponsavel.map((c) => c.id),
  ]);
  const total = idsPendentes.size + nuncaCadastradas.length;

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-success/40 bg-success/10 p-3 text-sm">
        <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
        <p>Todas as certidões obrigatórias estão vigentes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {total} {total === 1 ? "certidão obrigatória precisa" : "certidões obrigatórias precisam"} de atenção
        </p>
        <p className="text-muted-foreground">{motivos.join(" · ")}</p>
        {nuncaCadastradas.length > 0 && (
          // Estas não têm linha na tabela para o filtro alcançar — o nome é a única pista.
          <p className="mt-1 text-xs text-muted-foreground">
            Sem nenhum registro: {nuncaCadastradas.map((t) => t.nome).join(", ")}
          </p>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onVerPendencias}>
        Ver pendências
      </Button>
    </div>
  );
}
