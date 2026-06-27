"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  salvarCalculo,
  listarProjetosParaFerramenta,
  listarDisciplinasParaFerramenta,
} from "@/modules/ferramentas/actions";

type Projeto = { id: string; codigo: string; nome: string };
type Disciplina = { id: string; nome: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ferramenta: string;
  tituloSugerido: string;
  entradas: Record<string, unknown>;
  onSalvo: (id: string) => void;
};

export function SalvarDialog({
  open,
  onOpenChange,
  ferramenta,
  tituloSugerido,
  entradas,
  onSalvo,
}: Props) {
  const [titulo, setTitulo] = useState(tituloSugerido);
  const [projetoId, setProjetoId] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [carregandoProjetos, setCarregandoProjetos] = useState(false);
  const [carregandoDisciplinas, setCarregandoDisciplinas] = useState(false);
  const [pending, startTransition] = useTransition();

  // Carrega projetos ao abrir
  useEffect(() => {
    if (!open) return;
    setCarregandoProjetos(true);
    listarProjetosParaFerramenta({})
      .then((r) => {
        if (r.ok) setProjetos(r.data);
      })
      .finally(() => setCarregandoProjetos(false));
  }, [open]);

  // Carrega disciplinas ao selecionar projeto
  useEffect(() => {
    if (!projetoId) {
      setDisciplinas([]);
      setDisciplinaId("");
      return;
    }
    setCarregandoDisciplinas(true);
    listarDisciplinasParaFerramenta({ projetoId })
      .then((r) => {
        if (r.ok) setDisciplinas(r.data);
      })
      .finally(() => setCarregandoDisciplinas(false));
  }, [projetoId]);

  // Atualiza o titulo quando abre com novo tituloSugerido
  if (open && titulo !== tituloSugerido && !titulo) setTitulo(tituloSugerido);

  function handleFechar() {
    onOpenChange(false);
    // Limpa estado ao fechar
    setProjetoId("");
    setDisciplinaId("");
    setDisciplinas([]);
  }

  function handleSalvar() {
    if (!titulo.trim()) {
      toast.error("Informe um título para o cálculo.");
      return;
    }
    startTransition(async () => {
      const r = await salvarCalculo({
        ferramenta,
        titulo: titulo.trim(),
        entradas,
        projetoId: projetoId || undefined,
        disciplinaId: disciplinaId || undefined,
      });
      if (r.ok) {
        const msg =
          projetoId && disciplinaId
            ? `Cálculo "${titulo.trim()}" salvo e arquivado na disciplina.`
            : `Cálculo "${titulo.trim()}" salvo.`;
        toast.success(msg);
        onSalvo(r.data.id);
        handleFechar();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleFechar(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar cálculo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo-calculo">Nome do cálculo</Label>
            <Input
              id="titulo-calculo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Viga V1 — bloco B"
              onKeyDown={(e) => e.key === "Enter" && handleSalvar()}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projeto-calculo">Projeto (opcional)</Label>
            <Select
              value={projetoId}
              onValueChange={(v) => {
                setProjetoId(v ?? "");
                setDisciplinaId("");
              }}
            >
              <SelectTrigger id="projeto-calculo" disabled={carregandoProjetos}>
                <SelectValue
                  placeholder={carregandoProjetos ? "Carregando…" : "Nenhum"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum</SelectItem>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.codigo} — {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {projetoId && (
            <div className="space-y-1.5">
              <Label htmlFor="disciplina-calculo">Disciplina</Label>
              <Select
                value={disciplinaId}
                onValueChange={(v) => setDisciplinaId(v ?? "")}
              >
                <SelectTrigger
                  id="disciplina-calculo"
                  disabled={carregandoDisciplinas}
                >
                  <SelectValue
                    placeholder={carregandoDisciplinas ? "Carregando…" : "Selecione"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projetoId && !disciplinaId && (
                <p className="text-xs text-muted-foreground">
                  Selecione a disciplina para arquivar o cálculo automaticamente.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending || !titulo.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
