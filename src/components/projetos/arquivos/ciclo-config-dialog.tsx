"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { salvarConfigDocumentos } from "@/modules/uploads/ciclo/actions";
import { EVENTO_ARQUIVOS } from "@/components/projetos/arquivos/menu-arquivos";

export type ValoresConfigCiclo = {
  liberarObraAutomaticamente: boolean;
  permitirPublicarComPendencias: boolean;
  diasAlertaCompartilhado: number;
  exigirDwgParaPublicar: boolean;
};

/**
 * A9 — configuração do ciclo documental do projeto (só admin, D8). Aberta pelo ⋯ da barra de Arquivos
 * (evento), montada fora do menu para não fechar junto com ele.
 */
export function CicloConfigDialog({ projetoId, valores }: { projetoId: string; valores: ValoresConfigCiclo }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, start] = useTransition();
  const [form, setForm] = useState(valores);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const abrir = () => {
      setForm(valores);
      setErro(null);
      setAberto(true);
    };
    window.addEventListener(EVENTO_ARQUIVOS.configCiclo, abrir);
    return () => window.removeEventListener(EVENTO_ARQUIVOS.configCiclo, abrir);
  }, [valores]);

  function salvar() {
    start(async () => {
      const r = await salvarConfigDocumentos({ projetoId, ...form });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success("Configuração do ciclo salva.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && setAberto(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ciclo dos documentos</DialogTitle>
          <DialogDescription>Regras do ciclo de revisão (ISO 19650) neste projeto. Valem para as próximas ações.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="cfg-liberar">Liberar para obra ao publicar</Label>
              <p className="text-xs text-muted-foreground">
                A revisão publicada já fica liberada para obra, se não tiver restrição. Com restrição, não libera e avisa a coordenação.
              </p>
            </div>
            <Switch
              id="cfg-liberar"
              checked={form.liberarObraAutomaticamente}
              disabled={pendente}
              onCheckedChange={(v) => setForm((f) => ({ ...f, liberarObraAutomaticamente: v }))}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="cfg-pendencias">Permitir publicar com apontamentos em aberto</Label>
              <p className="text-xs text-muted-foreground">
                Exige justificativa e aplica uma restrição que sai sozinha quando todos forem resolvidos. Apontamento impeditivo
                bloqueia sempre.
              </p>
            </div>
            <Switch
              id="cfg-pendencias"
              checked={form.permitirPublicarComPendencias}
              disabled={pendente}
              onCheckedChange={(v) => setForm((f) => ({ ...f, permitirPublicarComPendencias: v }))}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="cfg-dwg">Exigir o DWG para publicar</Label>
              <p className="text-xs text-muted-foreground">
                A revisão só é publicada com o DWG junto do PDF. Modelos IFC não precisam.
              </p>
            </div>
            <Switch
              id="cfg-dwg"
              checked={form.exigirDwgParaPublicar}
              disabled={pendente}
              onCheckedChange={(v) => setForm((f) => ({ ...f, exigirDwgParaPublicar: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-dias">Avisar quando uma revisão ficar em análise por mais de (dias)</Label>
            <Input
              id="cfg-dias"
              type="number"
              min={1}
              max={90}
              className="w-28"
              value={form.diasAlertaCompartilhado}
              disabled={pendente}
              onChange={(e) => setForm((f) => ({ ...f, diasAlertaCompartilhado: Number(e.target.value) || 1 }))}
            />
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={pendente}>Cancelar</Button>
          <Button onClick={salvar} disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
