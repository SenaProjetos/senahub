"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { arquivarModeloCiclo, salvarModeloCiclo } from "@/modules/rh/ciclo/actions";
import { itensDoModelo } from "@/modules/rh/ciclo/acoes";
import {
  PUBLICO_LABEL,
  RESPONSAVEL_LABEL,
  rotuloPrazo,
  TIPO_CICLO_LABEL,
  type Publico,
  type Responsavel,
  type TipoCiclo,
} from "@/modules/rh/ciclo/regras";
import type { ModeloCiclo } from "@/modules/rh/ciclo/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ItemForm = { chave: number; descricao: string; responsavel: Responsavel; prazoDias: string; patrimonio: boolean };
type Form = { id?: string; nome: string; tipo: TipoCiclo; publico: Publico; itens: ItemForm[] };

let proximaChave = 1;
const novoItem = (): ItemForm => ({ chave: proximaChave++, descricao: "", responsavel: "rh", prazoDias: "", patrimonio: false });

function paraForm(m: ModeloCiclo): Form {
  return {
    id: m.id,
    nome: m.nome,
    tipo: m.tipo,
    publico: m.publico,
    itens: m.itens.map((it) => ({
      chave: proximaChave++,
      descricao: it.descricao,
      responsavel: it.responsavel,
      prazoDias: it.prazoDias == null ? "" : String(it.prazoDias),
      patrimonio: it.patrimonio,
    })),
  };
}

/**
 * Listas-modelo de entrada e saída. Mudar uma lista não mexe nos ciclos já abertos (eles
 * copiaram os itens ao abrir). Cada linha tem menu de contexto e `...` (ADR-0002).
 */
export function ModelosCicloAdmin({ modelos }: { modelos: ModeloCiclo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Form | null>(null);

  function aoSelecionar(m: ModeloCiclo, acao: AcaoItemAcao) {
    if (acao.id === "editar") setForm(paraForm(m));
    else if (acao.id === "arquivar" || acao.id === "reativar") {
      start(async () => {
        const r = await arquivarModeloCiclo({ id: m.id, ativo: acao.id === "reativar" });
        if (r.ok) {
          toast.success(acao.id === "arquivar" ? "Lista arquivada." : "Lista reativada.");
          router.refresh();
        } else toast.error(r.error);
      });
    }
  }

  function salvar() {
    if (!form) return;
    const prazoInvalido = form.itens.find((it) => it.prazoDias.trim() !== "" && !/^-?\d+$/.test(it.prazoDias.trim()));
    if (prazoInvalido) {
      toast.error(`Prazo inválido em "${prazoInvalido.descricao || "item sem descrição"}": use um número inteiro de dias.`);
      return;
    }
    start(async () => {
      const r = await salvarModeloCiclo({
        id: form.id,
        nome: form.nome,
        tipo: form.tipo,
        publico: form.publico,
        itens: form.itens.map((it) => ({
          descricao: it.descricao,
          responsavel: it.responsavel,
          prazoDias: it.prazoDias.trim() === "" ? null : Number(it.prazoDias.trim()),
          patrimonio: it.patrimonio,
        })),
      });
      if (r.ok) {
        toast.success("Lista salva.");
        setForm(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function mudarItem(chave: number, parte: Partial<ItemForm>) {
    setForm((f) => (f ? { ...f, itens: f.itens.map((it) => (it.chave === chave ? { ...it, ...parte } : it)) } : f));
  }
  function mover(indice: number, delta: number) {
    setForm((f) => {
      if (!f) return f;
      const alvo = indice + delta;
      if (alvo < 0 || alvo >= f.itens.length) return f;
      const itens = [...f.itens];
      [itens[indice], itens[alvo]] = [itens[alvo], itens[indice]];
      return { ...f, itens };
    });
  }

  function linha(m: ModeloCiclo) {
    const acoes = itensDoModelo(m);
    return (
      <LinhaComMenu
        key={m.id}
        itens={acoes}
        onSelect={(a) => aoSelecionar(m, a)}
        render={<li className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}
      >
        <div className="min-w-0">
          <p className={`text-sm font-medium ${m.ativo ? "" : "text-muted-foreground line-through"}`}>{m.nome}</p>
          <p className="text-xs text-muted-foreground">
            {TIPO_CICLO_LABEL[m.tipo]} · {PUBLICO_LABEL[m.publico]} · {m.itens.length} {m.itens.length === 1 ? "item" : "itens"}
            {m.usos > 0 && ` · usada ${m.usos}×`}
            {!m.ativo && " · arquivada"}
          </p>
        </div>
        <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionar(m, a)} rotulo={`Ações da lista ${m.nome}`} />
      </LinhaComMenu>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Listas-modelo</CardTitle>
          <CardDescription>O que entra em cada lista de entrada e saída, com dono e prazo.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setForm({ nome: "", tipo: "entrada", publico: "todos", itens: [novoItem()] })}>
          <Plus className="size-3.5" /> Nova lista
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-sm border">{modelos.map(linha)}</ul>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar lista-modelo" : "Nova lista-modelo"}</DialogTitle>
          </DialogHeader>
          {form && (
            <DialogBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_12rem]">
                <div className="space-y-1">
                  <Label htmlFor="modelo-nome">Nome</Label>
                  <Input id="modelo-nome" value={form.nome} maxLength={80} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modelo-tipo">Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: (v as TipoCiclo) ?? "entrada" })}>
                    <SelectTrigger id="modelo-tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modelo-publico">Para quem</Label>
                  <Select value={form.publico} onValueChange={(v) => setForm({ ...form, publico: (v as Publico) ?? "todos" })}>
                    <SelectTrigger id="modelo-publico" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PUBLICO_LABEL) as Publico[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PUBLICO_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Prazo em dias a partir do {form.tipo === "entrada" ? "início do vínculo" : "último dia do vínculo"}: -1 = véspera, 0 = no
                  dia, 5 = cinco dias depois. Vazio = sem prazo.
                </p>
                <ul className="space-y-2">
                  {form.itens.map((it, i) => (
                    <li key={it.chave} className="grid items-center gap-2 rounded-sm border p-2 sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem_auto]">
                      <Input
                        aria-label={`Descrição do item ${i + 1}`}
                        value={it.descricao}
                        maxLength={200}
                        placeholder="O que precisa ser feito"
                        onChange={(e) => mudarItem(it.chave, { descricao: e.target.value })}
                      />
                      <Select value={it.responsavel} onValueChange={(v) => mudarItem(it.chave, { responsavel: (v as Responsavel) ?? "rh" })}>
                        <SelectTrigger aria-label={`Responsável do item ${i + 1}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(RESPONSAVEL_LABEL) as Responsavel[]).map((r) => (
                            <SelectItem key={r} value={r}>
                              {RESPONSAVEL_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={`Prazo em dias do item ${i + 1}`}
                        inputMode="numeric"
                        value={it.prazoDias}
                        placeholder="dias"
                        title={rotuloPrazo(it.prazoDias.trim() === "" ? null : Number(it.prazoDias))}
                        onChange={(e) => mudarItem(it.chave, { prazoDias: e.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        <label className="flex items-center gap-1.5 pr-1 text-xs" title="Mostra os equipamentos da pessoa neste item">
                          <Checkbox checked={it.patrimonio} onCheckedChange={(v) => mudarItem(it.chave, { patrimonio: v === true })} />
                          Equipamentos
                        </label>
                        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Subir item" disabled={i === 0} onClick={() => mover(i, -1)}>
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label="Descer item"
                          disabled={i === form.itens.length - 1}
                          onClick={() => mover(i, 1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label="Remover item"
                          onClick={() => setForm({ ...form, itens: form.itens.filter((x) => x.chave !== it.chave) })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, itens: [...form.itens, novoItem()] })}>
                  <Plus className="size-3.5" /> Adicionar item
                </Button>
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button disabled={pending} onClick={salvar}>
              Salvar lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
