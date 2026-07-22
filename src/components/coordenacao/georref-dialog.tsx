"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Globe2 } from "lucide-react";
import { lerGeorreferenciamento, gravarGeorreferenciamento } from "@/modules/coordenacao/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ModeloGeorref = { uploadId: string; label: string };

type Form = {
  crsName: string;
  eastings: string;
  northings: string;
  orthogonalHeight: string;
  rotacaoGraus: string;
  escala: string;
};

const FORM_VAZIO: Form = { crsName: "", eastings: "0", northings: "0", orthogonalHeight: "0", rotacaoGraus: "0", escala: "" };

/**
 * Cria ou edita o georreferenciamento (IfcMapConversion, IFC4) de um modelo — declara
 * onde a origem local do modelo cai num CRS projetado real (Eastings/Northings/altura
 * + rotação da grade). NÃO move geometria (isso é o Realinhar); grava como nova versão.
 */
export function GeorrefDialog({
  aberto,
  onFechar,
  modelos,
}: {
  aberto: boolean;
  onFechar: () => void;
  modelos: ModeloGeorref[];
}) {
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [existente, setExistente] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!modeloId) {
      setForm(FORM_VAZIO);
      setExistente(false);
      return;
    }
    setCarregando(true);
    void lerGeorreferenciamento({ uploadId: modeloId })
      .then((r) => {
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const g = r.data;
        if (g) {
          setExistente(true);
          setForm({
            crsName: g.crsName,
            eastings: String(g.eastings),
            northings: String(g.northings),
            orthogonalHeight: String(g.orthogonalHeight),
            rotacaoGraus: String(g.rotacaoGraus),
            escala: g.escala != null ? String(g.escala) : "",
          });
        } else {
          setExistente(false);
          setForm(FORM_VAZIO);
        }
      })
      .finally(() => setCarregando(false));
  }, [modeloId]);

  function campo<K extends keyof Form>(chave: K, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function fechar() {
    setModeloId(null);
    onFechar();
  }

  function gravar() {
    if (!modeloId) return;
    const eastings = Number(form.eastings);
    const northings = Number(form.northings);
    const orthogonalHeight = Number(form.orthogonalHeight);
    const rotacaoGraus = Number(form.rotacaoGraus);
    const escala = form.escala.trim() ? Number(form.escala) : null;
    start(async () => {
      const r = await gravarGeorreferenciamento({
        uploadId: modeloId,
        crsName: form.crsName,
        eastings,
        northings,
        orthogonalHeight,
        rotacaoGraus,
        escala,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Georreferenciamento ${r.data.modo} — nova versão v${r.data.versao} gerada.`);
      fechar();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Globe2 className="size-4" /> Georreferenciamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Select value={modeloId ?? ""} onValueChange={(v) => setModeloId(v || null)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Escolha um modelo" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map((m) => (
                <SelectItem key={m.uploadId} value={m.uploadId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {modeloId && (
            <>
              {carregando ? (
                <p className="text-sm text-muted-foreground">Lendo georreferenciamento atual…</p>
              ) : (
                <>
                  <Badge variant={existente ? "secondary" : "outline"} className="w-fit">
                    {existente ? "Editando georreferenciamento existente" : "Criando novo georreferenciamento"}
                  </Badge>

                  <div className="space-y-1.5">
                    <Label className="text-xs">CRS de destino (ex.: EPSG:31983)</Label>
                    <Input
                      value={form.crsName}
                      onChange={(e) => campo("crsName", e.target.value)}
                      placeholder="EPSG:31983"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Eastings (m)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={form.eastings}
                        onChange={(e) => campo("eastings", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Northings (m)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={form.northings}
                        onChange={(e) => campo("northings", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Altura ortogonal (m)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={form.orthogonalHeight}
                        onChange={(e) => campo("orthogonalHeight", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rotação da grade (°)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={form.rotacaoGraus}
                        onChange={(e) => campo("rotacaoGraus", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Escala (opcional, ex.: 0,9996)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      value={form.escala}
                      onChange={(e) => campo("escala", e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <p className="rounded bg-muted/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                    Não move a geometria — só declara onde a origem do modelo cai no CRS real. Para
                    deslocar o modelo, use o Realinhar. Grava como nova versão (o arquivo atual não é
                    sobrescrito).
                  </p>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          {modeloId && !carregando && (
            <Button type="button" onClick={gravar} disabled={pending || !form.crsName.trim()}>
              {pending ? "Gravando…" : "Gravar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
