"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarEapComoModelo } from "@/modules/planejamento/modelos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls =
  "h-8 w-full min-w-0 rounded-sm border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Salvar como modelo": guarda a EAP do projeto como modelo para os próximos (o mesmo modelo da importação: se aplica, se
 * edita e se lista em Modelos de EAP). Mostra o que entra e, depois de salvar, o que ficou de fora.
 */
export function SalvarComoModeloDialog({
  projetoId,
  projetoCodigo,
  tipos,
  totalLinhas,
  totalMarcos,
  open,
  onOpenChange,
}: {
  projetoId: string;
  projetoCodigo: string;
  tipos: { id: string; nome: string }[];
  totalLinhas: number;
  totalMarcos: number;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [salvo, setSalvo] = useState<{ avisos: string[] } | null>(null);

  function fechar(aberto: boolean) {
    if (pending) return;
    onOpenChange(aberto);
    if (!aberto) setSalvo(null);
  }

  function salvar() {
    if (nome.trim().length < 2 || pending) return;
    start(async () => {
      const r = await salvarEapComoModelo({ projetoId, nome, descricao: descricao.trim() || null, tipoEmpreendimentoId: tipoId || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Modelo "${nome.trim()}" salvo.`);
      setSalvo({ avisos: r.data.avisos });
      setNome("");
      setDescricao("");
      setTipoId("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Salvar a EAP como modelo</DialogTitle>
          <DialogDescription>
            A EAP do projeto {projetoCodigo} ({totalLinhas === 1 ? "1 linha" : `${totalLinhas} linhas`}
            {totalMarcos > 0 ? `, ${totalMarcos === 1 ? "1 marco" : `${totalMarcos} marcos`}` : ""}) vira um modelo para usar em outros projetos.
          </DialogDescription>
        </DialogHeader>
        {salvo ? (
          <DialogBody className="space-y-3 text-sm">
            <p>
              Modelo salvo. Ele já está em{" "}
              <Link href="/planejamento/modelos" className="font-medium text-primary underline underline-offset-2">
                Modelos de EAP
              </Link>
              .
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {salvo.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </DialogBody>
        ) : (
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="modelo-nome">Nome do modelo</Label>
              <Input id="modelo-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Multifamiliar — cronograma padrão" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modelo-desc">Descrição (opcional)</Label>
              <Input id="modelo-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
            </div>
            {tipos.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="modelo-tipo">Tipo de empreendimento (opcional)</Label>
                <select id="modelo-tipo" value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={selectCls}>
                  <option value="">Qualquer tipo</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Entram a estrutura, as durações, os marcos e as predecessoras. Pessoas, horas, % concluído e datas fixadas não entram.
            </p>
          </DialogBody>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => fechar(false)} disabled={pending}>
            {salvo ? "Fechar" : "Cancelar"}
          </Button>
          {!salvo && (
            <Button type="button" onClick={salvar} disabled={nome.trim().length < 2 || pending}>
              {pending ? "Salvando…" : "Salvar modelo"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
