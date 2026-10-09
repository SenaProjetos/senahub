import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import { dicaDoControle, type CicloDaLinha, type ControleDaLinha } from "@/modules/uploads/ciclo/acoes";
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

/** A5: revisão recebida e ainda não aberta por quem olha. Derivado — não é status. */
export function SeloNovo({ ciclo }: { ciclo: CicloDaLinha }) {
  if (!ciclo.novo) return null;
  return (
    <Badge variant="outline" className="shrink-0 border-info/40 bg-info/10 text-[10px] text-info" title="Revisão nova que você ainda não abriu">
      Novo
    </Badge>
  );
}
