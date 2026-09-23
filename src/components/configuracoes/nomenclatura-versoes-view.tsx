"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Rocket, Trash2, CalendarClock, TriangleAlert } from "lucide-react";
import {
  criarRascunhoVersao,
  editarRascunhoVersao,
  excluirRascunhoVersao,
  publicarVersaoNomenclatura,
  type Redefinicao,
} from "@/modules/projetos/nomenclatura/versoes-actions";
import type { VersaoAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { EditorModeloNome } from "@/components/configuracoes/editor-modelo-nome";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

function paraInputDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

const SEQUENCIA_LABEL: Record<string, string> = {
  faixa: "Por faixa da disciplina (padrão original)",
  card: "Recomeça por disciplina",
  sub: "Recomeça por sub-disciplina",
};

export function NomenclaturaVersoesView({ versoes }: { versoes: VersaoAdmin[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [selecionadaId, setSelecionadaId] = useState<string | null>(
    versoes.find((v) => !v.publicadaEm)?.id ?? versoes.at(-1)?.id ?? null,
  );

  const selecionada = versoes.find((v) => v.id === selecionadaId) ?? null;
  const publicadas = versoes.filter((v) => v.publicadaEm);
  const ultimaNumero = versoes.at(-1)?.numero ?? 0;

  function criar() {
    if (!novoNome.trim()) return;
    start(async () => {
      const r = await criarRascunhoVersao({ nome: novoNome.trim(), baseadaEmId: versoes.at(-1)?.id });
      if (r.ok) {
        toast.success(`Rascunho v${r.data.numero} criado.`);
        setNovoNome("");
        setSelecionadaId(r.data.id);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Versões</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="divide-y">
            {[...versoes].reverse().map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelecionadaId(v.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1.5 text-left text-sm hover:bg-accent/50",
                    v.id === selecionadaId && "bg-accent",
                  )}
                >
                  <span className="min-w-0 truncate">
                    v{v.numero} — {v.nome}
                  </span>
                  {v.publicadaEm ? (
                    v.numero === Math.max(...publicadas.map((p) => p.numero), 0) ? (
                      <Badge className="shrink-0 text-[10px]">vigente</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[10px]">publicada</Badge>
                    )
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">rascunho</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {versoes.length === 0 && <EmptyState icon={CalendarClock} title="Nenhuma versão ainda" />}
          <div className="flex items-end gap-2 border-t pt-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Nova versão (a partir da v{ultimaNumero})</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Padrão 2026" />
            </div>
            <Button size="icon" aria-label="Criar rascunho" disabled={pending || !novoNome.trim()} onClick={criar}>
              <Plus className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selecionada ? (
        <VersaoDetalhe versao={selecionada} confirm={confirm} onExcluida={() => setSelecionadaId(versoes.find((v) => v.id !== selecionada.id)?.id ?? null)} />
      ) : (
        <Card><CardContent className="pt-6"><EmptyState icon={CalendarClock} title="Selecione ou crie uma versão" /></CardContent></Card>
      )}
    </div>
  );
}

function VersaoDetalhe({
  versao,
  confirm,
  onExcluida,
}: {
  versao: VersaoAdmin;
  confirm: ReturnType<typeof useConfirm>;
  onExcluida: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lastId, setLastId] = useState(versao.id);
  const [nome, setNome] = useState(versao.nome);
  const [descricao, setDescricao] = useState(versao.descricao ?? "");
  const [modelo, setModelo] = useState(versao.modelo ?? "");
  const [larguraNumero, setLarguraNumero] = useState(String(versao.larguraNumero));
  const [sequenciaPor, setSequenciaPor] = useState(versao.sequenciaPor);
  const [vigenteDesde, setVigenteDesde] = useState(paraInputDate(versao.vigenteDesde));
  const [redefinicoes, setRedefinicoes] = useState<Redefinicao[] | null>(null);

  if (versao.id !== lastId) {
    setLastId(versao.id);
    setNome(versao.nome);
    setDescricao(versao.descricao ?? "");
    setModelo(versao.modelo ?? "");
    setLarguraNumero(String(versao.larguraNumero));
    setSequenciaPor(versao.sequenciaPor);
    setVigenteDesde(paraInputDate(versao.vigenteDesde));
    setRedefinicoes(null);
  }

  const editavel = !versao.publicadaEm;

  function salvar() {
    if (!nome.trim() || !modelo.trim()) {
      toast.error("Informe nome e modelo.");
      return;
    }
    start(async () => {
      const r = await editarRascunhoVersao({
        id: versao.id,
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        modelo: modelo.trim(),
        larguraNumero: Number(larguraNumero) || 3,
        sequenciaPor,
        vigenteDesde,
      });
      if (r.ok) {
        toast.success("Rascunho salvo.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function publicar(confirmarRedefinicoes = false) {
    start(async () => {
      const r = await publicarVersaoNomenclatura({ id: versao.id, confirmarRedefinicoes });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (!r.data.publicado) {
        setRedefinicoes(r.data.redefinicoes);
        return;
      }
      toast.success(`v${versao.numero} publicada.`);
      setRedefinicoes(null);
      router.refresh();
    });
  }

  async function excluir() {
    const ok = await confirm({
      title: `Excluir o rascunho v${versao.numero}?`,
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirRascunhoVersao({ id: versao.id });
      if (r.ok) {
        toast.success("Rascunho excluído.");
        onExcluida();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">
            v{versao.numero} — {versao.nome}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {versao.publicadaEm
              ? `Publicada em ${new Date(versao.publicadaEm).toLocaleDateString("pt-BR")}${versao.publicadaPor?.name ? ` por ${versao.publicadaPor.name}` : ""} — imutável.`
              : "Rascunho — só vale para projeto nenhum até ser publicada."}
            {versao.projetosFixados > 0 && ` · ${versao.projetosFixados} projeto(s) nesta versão.`}
          </p>
        </div>
        {editavel && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={excluir}>
              <Trash2 className="size-3.5" /> Excluir
            </Button>
            <Button size="sm" disabled={pending} onClick={() => publicar(false)}>
              <Rocket className="size-3.5" /> Publicar
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!editavel} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vigente a partir de (projeto novo, D2)</Label>
            <Input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} disabled={!editavel} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dígitos do número da folha</Label>
            <Input type="number" min={1} max={6} value={larguraNumero} onChange={(e) => setLarguraNumero(e.target.value)} disabled={!editavel} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sequência do número</Label>
            <Select value={sequenciaPor} onValueChange={(v) => v && setSequenciaPor(v as typeof sequenciaPor)} disabled={!editavel}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SEQUENCIA_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Descrição (opcional)</Label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={!editavel}
            rows={2}
            className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </div>

        <div>
          <Label className="text-xs">Modelo do nome</Label>
          {editavel ? (
            <EditorModeloNome modelo={modelo} onChange={setModelo} />
          ) : (
            <p className="mt-1 rounded-sm bg-muted/50 p-2 font-mono text-xs">{modelo || "— (leitor embutido)"}</p>
          )}
        </div>

        {editavel && (
          <div className="flex justify-end border-t pt-3">
            <Button size="sm" disabled={pending} onClick={salvar}>Salvar rascunho</Button>
          </div>
        )}
      </CardContent>

      <Dialog open={redefinicoes !== null} onOpenChange={(o) => !o && setRedefinicoes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-500" /> Siglas com significado novo
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Estas siglas já significaram outra coisa numa versão publicada. Não é um erro — é o que D4 permite —, mas
              confira antes de publicar:
            </p>
            <ul className="space-y-1.5 text-sm">
              {redefinicoes?.map((r) => (
                <li key={r.sigla} className="rounded-sm border p-2">
                  <span className="font-mono font-medium">{r.sigla}</span>: era <em>{r.alvoAntigo.rotulo}</em> (desde a v{r.alvoAntigo.desdeVersao}),
                  passa a ser <em>{r.alvoNovo.rotulo}</em>.
                  {r.acervo > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">Aparece em {r.acervo} arquivo(s) já enviados.</span>
                  )}
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedefinicoes(null)}>Cancelar</Button>
            <Button onClick={() => publicar(true)}>Publicar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
