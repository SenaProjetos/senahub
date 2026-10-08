"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Plus, Target, Users } from "lucide-react";
import {
  definirCadencia,
  definirLideranca,
  encerrarLideranca,
  excluirEncontro,
  mudarStatusObjetivo,
  salvarEncontro,
  salvarObjetivo,
} from "@/modules/rh/desenvolvimento/actions";
import { itensDoEncontro, itensDoObjetivo } from "@/modules/rh/desenvolvimento/acoes";
import { STATUS_OBJETIVO_LABEL, VISIBILIDADE_LABEL, type Papel } from "@/modules/rh/desenvolvimento/regras";
import type { DesenvolvimentoDaPessoa } from "@/modules/rh/desenvolvimento/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dataCurta } from "@/lib/dias-iso";
import { formatarData } from "@/lib/utils";

type Objetivo = DesenvolvimentoDaPessoa["objetivos"][number];
type Encontro = DesenvolvimentoDaPessoa["encontros"][number];
const CADENCIAS = [7, 14, 30, 60, 90];
const AREA = "w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

/**
 * Aba Desenvolvimento (F3). `rh`: tudo, inclusive liderança e histórico antigo. `lider`: objetivos
 * e 1:1 do liderado (sem ficha completa nem salário). `self`: só leitura — objetivos e o 1:1
 * compartilhado. O servidor já manda recortado pelo papel; aqui só se decide o que é editável.
 */
export function DesenvolvimentoPessoa({
  userId,
  dados,
  papel,
  pessoas = [],
  competencias = [],
  lideraAlguem = 0,
}: {
  userId: string;
  dados: DesenvolvimentoDaPessoa;
  papel: Papel;
  /** Opções de liderança (só RH). */
  pessoas?: { id: string; name: string }[];
  /** Competências publicadas, para ligar um objetivo a uma delas. */
  competencias?: { id: string; nome: string }[];
  /** Na própria conta: quantas pessoas ela lidera (atalho para Minha equipe). */
  lideraAlguem?: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const escreve = papel === "rh" || papel === "lider";
  const [novoLider, setNovoLider] = useState("");
  const [objetivo, setObjetivo] = useState<{ id?: string; titulo: string; resultadoEsperado: string; alvo: string; habilidadeId: string } | null>(null);
  const [encontro, setEncontro] = useState<{
    id?: string; data: string; pauta: string; decisoes: string; acoes: string; proximoEm: string; compartilhar: boolean;
  } | null>(null);

  function rodar(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, depois?: () => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (ok) toast.success(ok);
        depois?.();
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível salvar.");
    });
  }

  async function aoSelecionarObjetivo(o: Objetivo, acao: AcaoItemAcao) {
    if (acao.id === "editar") setObjetivo({ id: o.id, titulo: o.titulo, resultadoEsperado: o.resultadoEsperado ?? "", alvo: o.alvo ?? "", habilidadeId: o.habilidadeId ?? "" });
    else {
      const status = acao.id === "concluir" ? "concluido" : acao.id === "cancelar" ? "cancelado" : "aberto";
      rodar(() => mudarStatusObjetivo({ id: o.id, status }), "Objetivo atualizado.");
    }
  }

  async function aoSelecionarEncontro(e: Encontro, acao: AcaoItemAcao) {
    if (acao.id === "editar") {
      setEncontro({ id: e.id, data: e.data, pauta: e.pauta ?? "", decisoes: e.decisoes ?? "", acoes: e.acoes ?? "", proximoEm: e.proximoEm ?? "", compartilhar: e.visibilidade === "compartilhado" });
      return;
    }
    if (acao.confirmar) {
      const ok = await confirm({ title: acao.confirmar.titulo, description: acao.confirmar.descricao, confirmLabel: acao.confirmar.rotuloConfirmar, variant: "destructive" });
      if (!ok) return;
    }
    rodar(() => excluirEncontro({ id: e.id }), "Registro excluído.");
  }

  async function encerrar() {
    const ok = await confirm({ title: "Encerrar a liderança atual?", description: "O histórico de objetivos e 1:1 fica.", confirmLabel: "Encerrar", variant: "destructive" });
    if (ok) rodar(() => encerrarLideranca({ userId }), "Liderança encerrada.");
  }

  const l = dados.lideranca;
  return (
    <div className="space-y-5">
      {papel === "self" && lideraAlguem > 0 && (
        <Link href="/rh/minha-equipe" className="flex items-center gap-2 rounded-sm border px-3 py-2 text-sm hover:bg-muted/40">
          <Users className="size-4 text-muted-foreground" /> Você lidera {lideraAlguem} pessoa(s) — abrir Minha equipe
        </Link>
      )}

      {/* Liderança e 1:1 */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Liderança direta</h4>
        {l ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{l.lider}</span> <span className="text-muted-foreground">desde {dataCurta(l.inicio)}</span>
            </span>
            <span className={`inline-flex items-center gap-1 ${l.proximo.vencido ? "font-medium text-destructive" : "text-muted-foreground"}`}>
              <CalendarClock className="size-3.5" />
              {l.proximo.vencido ? `1:1 atrasado ${l.proximo.diasAtraso} dia(s)` : `próximo 1:1 até ${dataCurta(l.proximo.em)}`}
            </span>
            {escreve ? (
              <Select value={String(l.cadenciaDias)} onValueChange={(v) => v && rodar(() => definirCadencia({ userId, cadenciaDias: Number(v) }), "Cadência salva.")}>
                <SelectTrigger className="h-8 w-40" aria-label="Cadência do 1:1" disabled={pending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...CADENCIAS, l.cadenciaDias])].sort((a, b) => a - b).map((d) => (
                    <SelectItem key={d} value={String(d)}>1:1 a cada {d} dias</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-muted-foreground">1:1 a cada {l.cadenciaDias} dias</span>
            )}
            {papel === "rh" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={encerrar}>Encerrar liderança</Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem liderança direta definida.</p>
        )}
        {papel === "rh" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={novoLider} onValueChange={(v) => setNovoLider(v ?? "")}>
              <SelectTrigger className="h-8 w-60" aria-label="Nova liderança">
                <SelectValue placeholder={l ? "Trocar liderança…" : "Definir liderança…"} />
              </SelectTrigger>
              <SelectContent>
                {pessoas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={pending || !novoLider}
              onClick={() => rodar(() => definirLideranca({ userId, liderId: novoLider }), "Liderança definida.", () => setNovoLider(""))}>
              Salvar liderança
            </Button>
          </div>
        )}
      </section>

      {/* Objetivos */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Objetivos de desenvolvimento</h4>
          {escreve && (
            <Button size="sm" variant="outline" onClick={() => setObjetivo({ titulo: "", resultadoEsperado: "", alvo: "", habilidadeId: "" })}>
              <Plus className="size-3.5" /> Novo objetivo
            </Button>
          )}
        </div>
        {dados.objetivos.length === 0 ? (
          <EmptyState icon={Target} title="Nenhum objetivo registrado" />
        ) : (
          <ul className="divide-y rounded-sm border">
            {dados.objetivos.map((o) => {
              const acoes = itensDoObjetivo(o, escreve);
              return (
                <LinhaComMenu key={o.id} itens={acoes} onSelect={(a) => aoSelecionarObjetivo(o, a)}
                  render={<li className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${o.status === "cancelado" ? "text-muted-foreground line-through" : ""}`}>{o.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_OBJETIVO_LABEL[o.status]}
                      {o.alvo && ` · até ${dataCurta(o.alvo)}`}
                      {o.habilidade && ` · ${o.habilidade}`}
                    </p>
                    {o.resultadoEsperado && <p className="mt-0.5 whitespace-pre-wrap text-sm">{o.resultadoEsperado}</p>}
                  </div>
                  <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionarObjetivo(o, a)} rotulo={`Ações do objetivo ${o.titulo}`} />
                </LinhaComMenu>
              );
            })}
          </ul>
        )}
      </section>

      {/* 1:1 */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Encontros 1:1</h4>
          {escreve && (
            <Button size="sm" variant="outline"
              onClick={() => setEncontro({ data: new Date().toISOString().slice(0, 10), pauta: "", decisoes: "", acoes: "", proximoEm: "", compartilhar: false })}>
              <Plus className="size-3.5" /> Registrar 1:1
            </Button>
          )}
        </div>
        {papel === "self" && <p className="text-xs text-muted-foreground">Aparecem aqui só os registros que a sua liderança compartilhou com você.</p>}
        {dados.encontros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro.</p>
        ) : (
          <ul className="space-y-2">
            {dados.encontros.map((e) => {
              const acoes = itensDoEncontro(escreve);
              return (
                <LinhaComMenu key={e.id} itens={acoes} onSelect={(a) => aoSelecionarEncontro(e, a)}
                  render={<li className="space-y-1 rounded-sm border px-3 py-2 data-[popup-open]:bg-muted/30" />}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {dataCurta(e.data)} · {e.lider}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{VISIBILIDADE_LABEL[e.visibilidade]}</span>
                    </p>
                    <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionarEncontro(e, a)} rotulo={`Ações do 1:1 de ${dataCurta(e.data)}`} />
                  </div>
                  {e.pauta && <p className="whitespace-pre-wrap text-sm"><span className="text-muted-foreground">Pauta: </span>{e.pauta}</p>}
                  {e.decisoes && <p className="whitespace-pre-wrap text-sm"><span className="text-muted-foreground">Decisões: </span>{e.decisoes}</p>}
                  {e.acoes && <p className="whitespace-pre-wrap text-sm"><span className="text-muted-foreground">Ações: </span>{e.acoes}</p>}
                  {e.proximoEm && <p className="text-xs text-muted-foreground">Próximo encontro: {dataCurta(e.proximoEm)}</p>}
                </LinhaComMenu>
              );
            })}
          </ul>
        )}
      </section>

      {papel === "rh" && (dados.historico.length > 0 || dados.liderancasAnteriores.length > 0) && (
        <CollapsibleSection titulo="Histórico" resumo={`${dados.historico.length} registro(s) antigo(s) · ${dados.liderancasAnteriores.length} liderança(s) anterior(es)`}>
          <div className="space-y-2 text-sm">
            {dados.liderancasAnteriores.map((h) => (
              <p key={h.id} className="text-muted-foreground">Liderança de {h.lider}: {dataCurta(h.inicio)} a {dataCurta(h.fim)}</p>
            ))}
            {dados.historico.map((h) => (
              <div key={h.id} className="rounded-sm border px-3 py-2">
                <p className="text-xs text-muted-foreground">{h.tipo.replace("_", " ")} · {formatarData(h.em)} · {h.autor}</p>
                <p className="whitespace-pre-wrap">{h.conteudo}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <Dialog open={!!objetivo} onOpenChange={(o) => !o && setObjetivo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{objetivo?.id ? "Editar objetivo" : "Novo objetivo"}</DialogTitle></DialogHeader>
          {objetivo && (
            <DialogBody className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="obj-titulo">Objetivo</Label>
                <Input id="obj-titulo" value={objetivo.titulo} maxLength={200} onChange={(e) => setObjetivo({ ...objetivo, titulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obj-resultado">Resultado esperado</Label>
                <textarea id="obj-resultado" rows={3} className={AREA} value={objetivo.resultadoEsperado} maxLength={1000}
                  onChange={(e) => setObjetivo({ ...objetivo, resultadoEsperado: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="obj-alvo">Data-alvo</Label>
                  <Input id="obj-alvo" type="date" value={objetivo.alvo} onChange={(e) => setObjetivo({ ...objetivo, alvo: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="obj-hab">Competência (opcional)</Label>
                  <Select value={objetivo.habilidadeId || "__nenhuma"} onValueChange={(v) => setObjetivo({ ...objetivo, habilidadeId: v === "__nenhuma" ? "" : (v ?? "") })}>
                    <SelectTrigger id="obj-hab" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhuma">Nenhuma</SelectItem>
                      {competencias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setObjetivo(null)}>Cancelar</Button>
            <Button disabled={pending || !objetivo?.titulo.trim()}
              onClick={() => objetivo && rodar(() => salvarObjetivo({
                id: objetivo.id, userId, titulo: objetivo.titulo, resultadoEsperado: objetivo.resultadoEsperado || null,
                alvo: objetivo.alvo || null, habilidadeId: objetivo.habilidadeId || null,
              }), "Objetivo salvo.", () => setObjetivo(null))}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!encontro} onOpenChange={(o) => !o && setEncontro(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{encontro?.id ? "Editar 1:1" : "Registrar 1:1"}</DialogTitle></DialogHeader>
          {encontro && (
            <DialogBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="enc-data">Data</Label>
                  <Input id="enc-data" type="date" value={encontro.data} onChange={(e) => setEncontro({ ...encontro, data: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enc-prox">Próximo encontro</Label>
                  <Input id="enc-prox" type="date" value={encontro.proximoEm} onChange={(e) => setEncontro({ ...encontro, proximoEm: e.target.value })} />
                </div>
              </div>
              {(["pauta", "decisoes", "acoes"] as const).map((campo) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`enc-${campo}`}>{campo === "pauta" ? "Pauta" : campo === "decisoes" ? "Decisões" : "Ações combinadas"}</Label>
                  <textarea id={`enc-${campo}`} rows={3} className={AREA} value={encontro[campo]} maxLength={4000}
                    onChange={(e) => setEncontro({ ...encontro, [campo]: e.target.value })} />
                </div>
              ))}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={encontro.compartilhar} onCheckedChange={(v) => setEncontro({ ...encontro, compartilhar: v === true })} className="mt-0.5" />
                <span>
                  Compartilhar com a pessoa
                  <span className="block text-xs text-muted-foreground">Sem marcar, só a liderança e o RH leem este registro.</span>
                </span>
              </label>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncontro(null)}>Cancelar</Button>
            <Button disabled={pending || !encontro?.data}
              onClick={() => encontro && rodar(() => salvarEncontro({
                id: encontro.id, userId, data: encontro.data, pauta: encontro.pauta || null, decisoes: encontro.decisoes || null,
                acoes: encontro.acoes || null, proximoEm: encontro.proximoEm || null, visibilidade: encontro.compartilhar ? "compartilhado" : "lider_rh",
              }), "1:1 registrado.", () => setEncontro(null))}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
