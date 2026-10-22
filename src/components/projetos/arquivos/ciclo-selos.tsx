import { Badge } from "@/components/ui/badge";
import { cn, rotuloRevisao } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import { avisoDaDescricao, dicaDoControle, type CicloDaLinha, type ControleDaLinha } from "@/modules/uploads/ciclo/acoes";
import { COR_CONTROLE, COR_ESTADO, ESTADO_ISO, ROTULO_CONTROLE, ROTULO_ESTADO } from "@/modules/uploads/ciclo/estados";

/** Selo do estado da revisão (ciclo documental). O termo da ISO 19650 vai na dica. */
export function SeloEstado({ ciclo, className }: { ciclo: CicloDaLinha; className?: string }) {
  if (!ciclo.participa || !ciclo.estado) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0", classeDoStatus(COR_ESTADO[ciclo.estado]), className)}
      title={`${ROTULO_ESTADO[ciclo.estado]} (ISO 19650: ${ESTADO_ISO[ciclo.estado]})`}
    >
      {ROTULO_ESTADO[ciclo.estado]}
    </Badge>
  );
}

/** Um selo pequeno por controle ativo — o motivo vai na dica, nunca só na cor. */
export function SelosControles({ controles }: { controles: readonly ControleDaLinha[] }) {
  return controles.map((c) => (
    <Badge key={c.id} variant="outline" className={cn("shrink-0 text-[10px]", classeDoStatus(COR_CONTROLE[c.tipo]))} title={dicaDoControle(c)}>
      {ROTULO_CONTROLE[c.tipo]}
    </Badge>
  ));
}

/** Revisão em análise com a descrição digitada contra o carimbo: quem analisa confere o PDF. O texto vai na dica. */
export function SeloDescricaoContestada({ ciclo }: { ciclo: CicloDaLinha }) {
  const aviso = avisoDaDescricao(ciclo);
  if (!aviso) return null;
  return (
    <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-[10px] text-warning" title={aviso} aria-label={aviso}>
      Descrição contestada
    </Badge>
  );
}

/** A5: revisão recebida e ainda não aberta por quem olha. Derivado — não é status. */
export function SeloNovo({ ciclo }: { ciclo: CicloDaLinha }) {
  if (!ciclo.novo) return null;
  return (
    <Badge variant="outline" className="shrink-0 border-info/40 bg-info/10 text-[10px] text-info" title="Revisão nova que você ainda não abriu">
      Novo
    </Badge>
  );
}

/**
 * "R00 em revisão" na linha de OUTRA revisão do documento (ex.: a R01 em andamento no Desenvolvimento): o
 * cliente pediu ajuste na publicada. Na linha da própria revisão marcada o selo do controle já diz isso.
 */
export function SeloRevisaoPedida({
  emRevisao,
  numeroDaLinha,
}: {
  emRevisao: { numero: number; motivo: string } | null;
  numeroDaLinha: number | null;
}) {
  if (!emRevisao || emRevisao.numero === numeroDaLinha) return null;
  const rotulo = `${rotuloRevisao(emRevisao.numero)} em revisão`;
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 text-[10px]", classeDoStatus(COR_CONTROLE.em_revisao))}
      title={`${rotulo}: ${emRevisao.motivo}`}
    >
      {rotulo}
    </Badge>
  );
}
