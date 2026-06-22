"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Check, X, Save, Camera, GitBranch, FileText, ShieldAlert } from "lucide-react";
import {
  solicitarRevisao,
  responderRevisao,
  salvarComposicaoPreco,
  salvarLmConfig,
  salvarLinhaBase,
  excluirLinhaBase,
  criarChecklistItem,
  toggleChecklistItem,
  excluirChecklistItem,
  criarRisco,
  atualizarRisco,
  excluirRisco,
} from "@/modules/projetos/extras/actions";
import type { extrasDoProjeto } from "@/modules/projetos/extras/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

type Dados = Awaited<ReturnType<typeof extrasDoProjeto>>;
const STATUS_REV: Record<string, string> = { pendente: "text-warning border-warning/40", aceita: "text-success border-success/40", recusada: "text-destructive border-destructive/40" };

export function ExtrasView({
  projeto,
  dados,
  podeGerir,
}: {
  projeto: { id: string; codigo: string; nome: string };
  dados: Dados;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // N-34: checklist
  const [novoItem, setNovoItem] = useState("");
  function adicionarItem() {
    if (!novoItem.trim()) return;
    start(async () => {
      const r = await criarChecklistItem({ projetoId: projeto.id, descricao: novoItem.trim() });
      if (r.ok) { toast.success("Item adicionado."); setNovoItem(""); router.refresh(); }
      else toast.error(r.ok === false ? r.error : "Erro");
    });
  }
  function toggleItem(itemId: string, concluido: boolean) {
    start(async () => {
      const r = await toggleChecklistItem({ itemId, concluido });
      if (r.ok) router.refresh();
      else toast.error(r.ok === false ? r.error : "Erro");
    });
  }
  function rmItem(itemId: string) {
    start(async () => {
      const r = await excluirChecklistItem({ itemId });
      if (r.ok) { toast.success("Item removido."); router.refresh(); }
      else toast.error(r.ok === false ? r.error : "Erro");
    });
  }

  // N-39: riscos
  const [riscoDesc, setRiscoDesc] = useState("");
  const [riscoProb, setRiscoProb] = useState<string | null>("1");
  const [riscoImp, setRiscoImp] = useState<string | null>("1");
  const GRAU = ["", "Baixo", "Médio", "Alto"];
  function adicionarRisco() {
    if (!riscoDesc.trim()) return;
    start(async () => {
      const r = await criarRisco({
        projetoId: projeto.id,
        descricao: riscoDesc.trim(),
        probabilidade: Number(riscoProb ?? "1"),
        impacto: Number(riscoImp ?? "1"),
      });
      if (r.ok) { toast.success("Risco registrado."); setRiscoDesc(""); setRiscoProb("1"); setRiscoImp("1"); router.refresh(); }
      else toast.error(r.ok === false ? r.error : "Erro");
    });
  }
  function mudarStatusRisco(riscoId: string, status: "aberto" | "mitigado" | "aceito") {
    start(async () => {
      const r = await atualizarRisco({ riscoId, status });
      if (r.ok) router.refresh(); else toast.error(r.ok === false ? r.error : "Erro");
    });
  }
  function rmRisco(riscoId: string) {
    start(async () => {
      const r = await excluirRisco({ riscoId });
      if (r.ok) { toast.success("Risco removido."); router.refresh(); }
      else toast.error(r.ok === false ? r.error : "Erro");
    });
  }

  // B2
  const [discId, setDiscId] = useState("");
  const [motivo, setMotivo] = useState("");
  function pedirRevisao() {
    if (!discId || !motivo.trim()) {
      toast.error("Selecione a disciplina e descreva o motivo.");
      return;
    }
    start(async () => {
      const r = await solicitarRevisao({ disciplinaId: discId, motivo });
      if (r.ok) {
        toast.success("Revisão solicitada.");
        setMotivo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function responder(id: string, aceitar: boolean) {
    start(async () => {
      const r = await responderRevisao({ id, aceitar, respostaMotivo: "" });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  // B3
  const [itens, setItens] = useState(dados.composicao.itens.map((i) => ({ ...i })));
  const [obs, setObs] = useState(dados.composicao.observacao ?? "");
  const totalComp = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  function addItem() {
    setItens([...itens, { id: crypto.randomUUID(), descricao: "", quantidade: 1, valorUnitario: 0 }]);
  }
  function salvarComp() {
    start(async () => {
      const r = await salvarComposicaoPreco({
        projetoId: projeto.id,
        observacao: obs,
        itens: itens.filter((i) => i.descricao.trim()).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
      });
      if (r.ok) {
        toast.success("Composição salva.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // B4
  const [lm, setLm] = useState(dados.lmConteudo);
  function salvarLm() {
    start(async () => {
      const r = await salvarLmConfig({ projetoId: projeto.id, conteudo: lm });
      if (r.ok) toast.success("Config LM salva.");
      else toast.error(r.error);
    });
  }

  // B5
  const [lbNome, setLbNome] = useState("");
  function fotografar() {
    if (!lbNome.trim()) return;
    start(async () => {
      const r = await salvarLinhaBase({ projetoId: projeto.id, nome: lbNome });
      if (r.ok) {
        toast.success(`Linha de base salva (${r.data.tarefas} tarefas).`);
        setLbNome("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rmLinha(id: string) {
    start(async () => {
      const r = await excluirLinhaBase({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Mais funções do projeto</h2>
      </div>

      {/* B2 — Solicitações de revisão */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Solicitações de revisão</CardTitle>
          <CardDescription>Pedidos formais de revisão de disciplina.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dados.solicitacoes.length === 0 ? (
            <EmptyState icon={GitBranch} title="Nenhuma solicitação" />
          ) : (
            <ul className="divide-y text-sm">
              {dados.solicitacoes.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{s.disciplina} <Badge variant="outline" className={STATUS_REV[s.status]}>{s.status}</Badge></p>
                    <p className="text-xs text-muted-foreground">{s.solicitante}: {s.motivo}</p>
                  </div>
                  {podeGerir && s.status === "pendente" && (
                    <span className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" className="text-success" aria-label="Aceitar" onClick={() => responder(s.id, true)} disabled={pending}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label="Recusar" onClick={() => responder(s.id, false)} disabled={pending}>
                        <X className="size-4" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <Select value={discId} onValueChange={(v) => setDiscId(v ?? "")}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Disciplina" /></SelectTrigger>
              <SelectContent>
                {dados.disciplinas.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Motivo da revisão" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="min-w-48 flex-1" />
            <Button size="sm" variant="outline" onClick={pedirRevisao} disabled={pending}>
              <Plus className="size-3.5" /> Solicitar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* B3 — Composição de preço */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição de preço</CardTitle>
          <CardDescription>Memória de cálculo do valor do projeto. Total: <span className="font-mono font-semibold">{brl(totalComp)}</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {itens.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr><th className="py-1">Descrição</th><th className="w-20 py-1">Qtd</th><th className="w-28 py-1">Vlr unit.</th><th className="w-28 py-1 text-right">Total</th><th className="w-8" /></tr>
              </thead>
              <tbody>
                {itens.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="py-1 pr-2">
                      <Input value={it.descricao} disabled={!podeGerir} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))} className="h-8" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" step="0.01" value={it.quantidade} disabled={!podeGerir} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, quantidade: Number(e.target.value) || 0 } : x))} className="h-8" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" step="0.01" value={it.valorUnitario} disabled={!podeGerir} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, valorUnitario: Number(e.target.value) || 0 } : x))} className="h-8" />
                    </td>
                    <td className="py-1 text-right font-mono text-xs">{brl(it.quantidade * it.valorUnitario)}</td>
                    <td className="py-1">
                      {podeGerir && (
                        <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setItens(itens.filter((_, i) => i !== idx))}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {podeGerir && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={addItem}><Plus className="size-3.5" /> Item</Button>
              <Input placeholder="Observação" value={obs} onChange={(e) => setObs(e.target.value)} className="min-w-40 flex-1" />
              <Button size="sm" variant="outline" onClick={salvarComp} disabled={pending}><Save className="size-3.5" /> Salvar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B4 — Config LM (BIM) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lista de materiais (LM / BIM)</CardTitle>
          <CardDescription>Configuração livre da lista de materiais do projeto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={lm}
            onChange={(e) => setLm(e.target.value)}
            disabled={!podeGerir}
            rows={5}
            className="w-full rounded-sm border bg-transparent p-2 font-mono text-xs"
            placeholder="Itens, quantidades, especificações…"
          />
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={salvarLm} disabled={pending}><Save className="size-3.5" /> Salvar LM</Button>
          )}
        </CardContent>
      </Card>

      {/* B5 — Linhas de base */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Linhas de base do cronograma</CardTitle>
          <CardDescription>Fotografa as datas atuais da EAP para comparar depois.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dados.linhasBase.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhuma linha de base" />
          ) : (
            <ul className="divide-y text-sm">
              {dados.linhasBase.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{l.nome} <span className="text-xs text-muted-foreground">· {l.tarefas} tarefa(s) · {formatarData(l.createdAt)}</span></span>
                  {podeGerir && (
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => rmLinha(l.id)} disabled={pending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {podeGerir && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <Input placeholder="Nome (ex.: Baseline contratual)" value={lbNome} onChange={(e) => setLbNome(e.target.value)} className="min-w-48 flex-1" />
              <Button size="sm" variant="outline" onClick={fotografar} disabled={pending}><Camera className="size-3.5" /> Salvar linha de base</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* N-34: Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Check className="size-4" /> Checklist
          </CardTitle>
          <CardDescription>Itens de ação livres para controle do projeto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {dados.checklist.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item.</p>}
          <ul className="space-y-1.5">
            {dados.checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.concluido}
                  onChange={(e) => toggleItem(c.id, e.target.checked)}
                  disabled={!podeGerir || pending}
                  className="size-4 accent-primary"
                />
                <span className={c.concluido ? "line-through text-muted-foreground" : ""}>{c.descricao}</span>
                {podeGerir && (
                  <Button size="icon" variant="ghost" className="ml-auto size-6" onClick={() => rmItem(c.id)} disabled={pending}>
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {podeGerir && (
            <div className="flex gap-2 border-t pt-3">
              <Input
                placeholder="Novo item..."
                value={novoItem}
                onChange={(e) => setNovoItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionarItem()}
                className="flex-1"
              />
              <Button size="sm" onClick={adicionarItem} disabled={pending || !novoItem.trim()}>
                <Plus className="size-4" /> Adicionar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* N-39: Riscos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" /> Riscos
          </CardTitle>
          <CardDescription>Registro de riscos identificados e plano de mitigação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dados.riscos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum risco registrado.</p>}
          <div className="space-y-2">
            {dados.riscos.map((r) => {
              const nivel = r.probabilidade * r.impacto;
              const corNivel = nivel >= 6 ? "text-destructive" : nivel >= 3 ? "text-warning" : "text-muted-foreground";
              return (
                <div key={r.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className={r.status !== "aberto" ? "text-muted-foreground line-through" : ""}>{r.descricao}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={`text-xs font-medium ${corNivel}`}>
                        P{r.probabilidade}×I{r.impacto}
                      </span>
                      {podeGerir && (
                        <>
                          <Select<string> value={r.status} onValueChange={(v: string | null) => v && mudarStatusRisco(r.id, v as "aberto" | "mitigado" | "aceito")}>
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="aberto">Aberto</SelectItem>
                              <SelectItem value="mitigado">Mitigado</SelectItem>
                              <SelectItem value="aceito">Aceito</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="size-6" onClick={() => rmRisco(r.id)} disabled={pending}>
                            <Trash2 className="size-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {r.mitigacao && <p className="mt-1 text-xs text-muted-foreground">Mitigação: {r.mitigacao}</p>}
                </div>
              );
            })}
          </div>
          {podeGerir && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Descreva o risco..."
                  value={riscoDesc}
                  onChange={(e) => setRiscoDesc(e.target.value)}
                  className="min-w-48 flex-1"
                />
                <Select<string> value={riscoProb} onValueChange={(v) => setRiscoProb(v)}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Prob." />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>P: {GRAU[n]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select<string> value={riscoImp} onValueChange={(v) => setRiscoImp(v)}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Impacto" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>I: {GRAU[n]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={adicionarRisco} disabled={pending || !riscoDesc.trim()}>
                  <Plus className="size-4" /> Registrar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
