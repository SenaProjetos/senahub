"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { diasDoConflito, type AvisoCascata, type ConflitoEmCascata } from "@/modules/planejamento/cascata";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const linkDaPessoa = (c: Pick<ConflitoEmCascata, "userId" | "dias">) =>
  `/recursos/por-pessoa?pessoa=${encodeURIComponent(c.userId)}&de=${c.dias[0]}`;

/**
 * O aviso em cascata para quem gravou (pool de recursos, decisões C–F e 8): a data real ou a Data de Status que acabou de
 * entrar pôs alguém acima da jornada num dia em que já estava em outro cronograma. Só informa — nada muda de data — e
 * lista também os rascunhos afetados, sem dizer que alguém foi avisado (a coordenação do rascunho não recebe nada).
 */
export function AvisoCascataDialog({
  aviso,
  verRecursos,
  onClose,
}: {
  /** `null` = fechado. */
  aviso: AvisoCascata | null;
  /** `recursos:ver`: "Ver na tela por pessoa". */
  verRecursos: boolean;
  onClose: () => void;
}) {
  const conflitos = aviso?.conflitos ?? [];
  const titulo = aviso?.origem === "data_status" ? "Data de Status registrada: conflito de recurso" : "Data real registrada: conflito de recurso";
  const pessoas = new Set(conflitos.map((c) => c.userId)).size;
  const resumo =
    pessoas === 1
      ? `${conflitos[0]?.nome ?? "Uma pessoa"} passou da jornada num dia em que já estava em outro cronograma.`
      : `${pessoas} pessoas passaram da jornada em dias em que já estavam em outro cronograma.`;

  return (
    <Dialog open={aviso != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4 text-warning" aria-hidden /> {titulo}
          </DialogTitle>
          <DialogDescription>{resumo} Nenhuma data foi alterada.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul aria-label="Conflitos de recurso novos" className="divide-y rounded-sm border">
            {conflitos.map((c, i) => {
              const outro = c.outro ? `${c.outro.rotulo}${c.outroRascunho ? " (rascunho)" : ""}` : c.outroRascunho ? "Outro projeto (rascunho)" : "Outro projeto";
              return (
                <li key={`${c.userId}:${i}`} className="space-y-1 px-3 py-2 text-sm">
                  <p>
                    <strong>{c.nome}</strong> · {diasDoConflito(c.dias, diaMes)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aqui: {c.linhasDeste.join(", ") || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {outro}
                    {c.outro && c.outro.linhas.length > 0 ? `: ${c.outro.linhas.join(", ")}` : ""}
                  </p>
                  {c.coordenacaoAvisada && (
                    <p className="text-xs">A coordenação {c.outro ? `do ${c.outro.codigo}` : "do outro projeto"} também foi avisada.</p>
                  )}
                  {verRecursos && (
                    <Link
                      href={linkDaPessoa(c)}
                      onClick={onClose}
                      className="text-xs text-primary underline underline-offset-[3px]"
                      aria-label={`Ver na tela por pessoa: ${c.nome}, ${diasDoConflito(c.dias, diaMes)}`}
                    >
                      Ver na tela por pessoa
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {verRecursos && pessoas === 1 && conflitos[0] && (
            <Link href={linkDaPessoa(conflitos[0])} onClick={onClose} className={buttonVariants()}>
              Ver na tela por pessoa
            </Link>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
