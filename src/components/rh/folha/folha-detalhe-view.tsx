"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Lock, Unlock, Mail, Pencil, Wand2 } from "lucide-react";
import {
  salvarHolerite,
  removerHolerite,
  fecharFolha,
  reabrirFolha,
  enviarHolerites,
  gerarHoleritesAutomatico,
} from "@/modules/rh/folha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { calcularEncargos, type Faixa } from "@/lib/encargos";
import { brl } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Item = {
  id?: string;
  rubricaId: string | null;
  descricao: string;
  tipo: "provento" | "desconto";
  valor: number;
};
type HoleriteT = {
  id: string;
  enviadoEm: string | null;
  user: { id: string; name: string; role: string };
  itens: Item[];
};
type Rubrica = { id: string; nome: string; tipo: "provento" | "desconto" };

function proventosDe(itens: Item[]) {
  return itens.reduce((s, it) => s + (it.tipo === "provento" ? it.valor : 0), 0);
}
function descontosDe(itens: Item[]) {
  return itens.reduce((s, it) => s + (it.tipo === "desconto" ? it.valor : 0), 0);
}
function liquidoDe(itens: Item[]) {
  return proventosDe(itens) - descontosDe(itens);
}

export function FolhaDetalheView({
  folha,
  rubricas,
  elegiveis,
  modelosDoc,
  faixasInss,
  faixasIrrf,
  deducaoDep,
  dependentesPorUser,
}: {
  folha: { id: string; ano: number; mes: number; status: "aberta" | "fechada"; holerites: HoleriteT[] };
  rubricas: Rubrica[];
  elegiveis: { id: string; name: string; role: string }[];
  modelosDoc: { id: string; nome: string }[];
  faixasInss: Faixa[];
  faixasIrrf: Faixa[];
  deducaoDep: number;
  dependentesPorUser: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editor, setEditor] = useState<{ userId: string; nome: string; itens: Item[] } | null>(null);
  const [preview, setPreview] = useState(false);

  const aberta = folha.status === "aberta";
  const total = folha.holerites.reduce((s, h) => s + liquidoDe(h.itens), 0);
  const semHolerite = elegiveis.filter((e) => !folha.holerites.some((h) => h.user.id === e.id));

  function fechar() {
    start(async () => {
      const r = await fecharFolha({ id: folha.id });
      if (r.ok) {
        toast.success(`Folha fechada — ${brl(r.data.liquido)} lançado na DRE.`);
        setPreview(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function gerarAuto() {
    start(async () => {
      const r = await gerarHoleritesAutomatico({ id: folha.id });
      if (r.ok) {
        toast.success(`${r.data.criados} holerite(s) gerado(s) automaticamente.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function reabrir() {
    start(async () => {
      const r = await reabrirFolha({ id: folha.id });
      if (r.ok) {
        toast.success("Folha reaberta — lançamento removido.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function enviar() {
    start(async () => {
      const r = await enviarHolerites({ id: folha.id });
      if (r.ok) {
        toast.success(`${r.data.enviados}/${r.data.total} holerite(s) enviados por e-mail.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function remover(id: string) {
    start(async () => {
      const r = await removerHolerite({ id });
      if (r.ok) {
        toast.success("Holerite removido.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/rh/folha" aria-label="Voltar" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">
              Folha {String(folha.mes).padStart(2, "0")}/{folha.ano}
            </h2>
            <p className="text-sm text-muted-foreground">
              {folha.holerites.length} holerite(s) · líquido {brl(total)}
            </p>
          </div>
          <StatusBadge tone={aberta ? "warning" : "success"}>
            {folha.status}
          </StatusBadge>
        </div>
        <div className="flex flex-wrap gap-2">
          {aberta ? (
            <>
              <Button variant="outline" onClick={gerarAuto} disabled={pending}>
                <Wand2 className="size-4" /> Gerar automático
              </Button>
              <Button onClick={() => setPreview(true)} disabled={pending || folha.holerites.length === 0}>
                <Lock className="size-4" /> Fechar folha
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reabrir} disabled={pending}>
                <Unlock className="size-4" /> Reabrir
              </Button>
              <Button onClick={enviar} disabled={pending}>
                <Mail className="size-4" /> Enviar holerites
              </Button>
            </>
          )}
        </div>
      </div>

      {aberta && semHolerite.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-3">
          <span className="text-xs text-muted-foreground">Adicionar holerite:</span>
          {semHolerite.map((u) => (
            <Button
              key={u.id}
              size="sm"
              variant="outline"
              onClick={() =>
                setEditor({
                  userId: u.id,
                  nome: u.name,
                  itens: [
                    {
                      rubricaId: rubricas.find((r) => r.nome === "Salário base")?.id ?? null,
                      descricao: "Salário base",
                      tipo: "provento",
                      valor: 0,
                    },
                  ],
                })
              }
            >
              <Plus className="size-3.5" /> {u.name}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {folha.holerites.map((h) => (
          <Card key={h.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{h.user.name}</CardTitle>
                <div className="flex items-center gap-1">
                  <GerarDocumentoButton modelos={modelosDoc} paramId="holeriteId" valor={h.id} variant="ghost" />
                  {h.enviadoEm && (
                    <StatusBadge tone="success">enviado</StatusBadge>
                  )}
                  {aberta && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Editar"
                        onClick={() =>
                          setEditor({ userId: h.user.id, nome: h.user.name, itens: [...h.itens] })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remover"
                        onClick={() => remover(h.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {h.itens.map((it, i) => (
                  <li key={it.id ?? i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{it.descricao}</span>
                    <span className={`font-mono ${it.tipo === "desconto" ? "text-destructive" : ""}`}>
                      {it.tipo === "desconto" ? "-" : ""}
                      {brl(it.valor)}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t pt-1 font-semibold">
                  <span>Líquido</span>
                  <span className="font-mono">{brl(liquidoDe(h.itens))}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <HoleriteEditor
        folhaId={folha.id}
        editor={editor}
        rubricas={rubricas}
        faixasInss={faixasInss}
        faixasIrrf={faixasIrrf}
        deducaoDependentes={editor ? (dependentesPorUser[editor.userId] ?? 0) * deducaoDep : 0}
        onClose={() => setEditor(null)}
      />

      <FecharFolhaPreview
        open={preview}
        onClose={() => setPreview(false)}
        onConfirm={fechar}
        pending={pending}
        mes={folha.mes}
        ano={folha.ano}
        holerites={folha.holerites}
        totalLiquido={total}
      />
    </div>
  );
}

/** Pré-visualização dos holerites (proventos, descontos, líquido) antes de fechar a folha. */
function FecharFolhaPreview({
  open,
  onClose,
  onConfirm,
  pending,
  mes,
  ano,
  holerites,
  totalLiquido,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  mes: number;
  ano: number;
  holerites: HoleriteT[];
  totalLiquido: number;
}) {
  const totalProventos = holerites.reduce((s, h) => s + proventosDe(h.itens), 0);
  const totalDescontos = holerites.reduce((s, h) => s + descontosDe(h.itens), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Pré-visualizar folha {String(mes).padStart(2, "0")}/{ano}
          </DialogTitle>
          <DialogDescription>
            Confira os holerites antes de fechar. Ao confirmar, o líquido vira um lançamento de
            despesa confirmado na DRE (categoria 2.03).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {holerites.map((h) => {
            const proventos = proventosDe(h.itens);
            const descontos = descontosDe(h.itens);
            return (
              <div key={h.id} className="rounded-sm border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{h.user.name}</span>
                  <span className="font-mono text-sm font-semibold">{brl(proventos - descontos)}</span>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {h.itens.map((it, i) => (
                    <li key={it.id ?? i} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{it.descricao}</span>
                      <span className={`font-mono ${it.tipo === "desconto" ? "text-destructive" : ""}`}>
                        {it.tipo === "desconto" ? "-" : ""}
                        {brl(it.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t pt-1 text-xs text-muted-foreground">
                  <span>
                    Proventos <span className="font-mono text-success">{brl(proventos)}</span>
                  </span>
                  <span>
                    Descontos <span className="font-mono">{brl(descontos)}</span>
                  </span>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">
              {holerites.length} holerite(s) · proventos{" "}
              <span className="font-mono text-success">{brl(totalProventos)}</span> · descontos{" "}
              <span className="font-mono">{brl(totalDescontos)}</span>
            </span>
            <span className="font-semibold">
              Líquido a lançar: <span className="font-mono">{brl(totalLiquido)}</span>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={pending || totalLiquido <= 0}>
            <Lock className="size-4" /> {pending ? "Fechando…" : "Confirmar e fechar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HoleriteEditor({
  folhaId,
  editor,
  rubricas,
  faixasInss,
  faixasIrrf,
  deducaoDependentes,
  onClose,
}: {
  folhaId: string;
  editor: { userId: string; nome: string; itens: Item[] } | null;
  rubricas: Rubrica[];
  faixasInss: Faixa[];
  faixasIrrf: Faixa[];
  deducaoDependentes: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [itens, setItens] = useState<Item[]>(editor?.itens ?? []);
  const key = editor?.userId ?? "none";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setItens(editor?.itens ?? []);
  }

  function setItem(i: number, patch: Partial<Item>) {
    setItens((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem(rubricaId: string | null) {
    const r = rubricas.find((x) => x.id === rubricaId);
    setItens((arr) => [
      ...arr,
      {
        rubricaId,
        descricao: r?.nome ?? "",
        tipo: r?.tipo ?? "provento",
        valor: 0,
      },
    ]);
  }

  /** Calcula INSS/IRRF sobre o total de proventos e injeta os descontos. */
  function calcularEncargosClick() {
    const proventos = itens
      .filter((it) => it.tipo === "provento")
      .reduce((s, it) => s + (Number(it.valor) || 0), 0);
    if (proventos <= 0) {
      toast.error("Adicione proventos antes de calcular encargos.");
      return;
    }
    const { inss, irrf } = calcularEncargos(proventos, faixasInss, faixasIrrf, deducaoDependentes);
    setItens((arr) => {
      const semAuto = arr.filter((it) => it.descricao !== "INSS" && it.descricao !== "IRRF");
      const novos = [...semAuto];
      if (inss > 0) novos.push({ rubricaId: null, descricao: "INSS", tipo: "desconto", valor: inss });
      if (irrf > 0) novos.push({ rubricaId: null, descricao: "IRRF", tipo: "desconto", valor: irrf });
      return novos;
    });
    if (inss === 0 && irrf === 0) {
      toast.message("Configure as faixas em Configurações → Encargos.");
    } else {
      toast.success(`INSS R$ ${inss.toLocaleString("pt-BR")} · IRRF R$ ${irrf.toLocaleString("pt-BR")}`);
    }
  }

  function salvar() {
    if (!editor) return;
    const validos = itens.filter((it) => it.descricao && it.valor > 0);
    if (validos.length === 0) {
      toast.error("Adicione ao menos um item com valor.");
      return;
    }
    start(async () => {
      const r = await salvarHolerite({
        folhaId,
        userId: editor.userId,
        itens: validos.map((it) => ({
          rubricaId: it.rubricaId ?? "",
          descricao: it.descricao,
          tipo: it.tipo,
          valor: it.valor,
        })),
      });
      if (r.ok) {
        toast.success("Holerite salvo.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!editor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Holerite — {editor?.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={it.descricao}
                onChange={(e) => setItem(i, { descricao: e.target.value })}
                placeholder="Descrição"
              />
              <Select
                value={it.tipo}
                onValueChange={(v) => setItem(i, { tipo: (v as Item["tipo"]) ?? "provento" })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="provento">Provento</SelectItem>
                  <SelectItem value="desconto">Desconto</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="w-28"
                value={it.valor || ""}
                onChange={(e) => setItem(i, { valor: Number(e.target.value) })}
                placeholder="Valor"
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover item"
                onClick={() => setItens((arr) => arr.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {rubricas.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addItem(r.id)}
                className="rounded-sm border px-2 py-1 text-xs text-muted-foreground hover:border-primary/50"
              >
                + {r.nome}
              </button>
            ))}
            <button
              type="button"
              onClick={calcularEncargosClick}
              className="rounded-sm border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary/10"
            >
              ∑ Calcular INSS/IRRF
            </button>
          </div>

          <p className="border-t pt-2 text-right text-sm font-semibold">
            Líquido: <span className="font-mono">{brl(liquidoDe(itens))}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar holerite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
