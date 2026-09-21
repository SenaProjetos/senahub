"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Eye, EyeOff, FileText, Layers, Pencil, Plus } from "lucide-react";
import {
  alternarClausula,
  alternarModeloProposta,
  criarClausula,
  editarClausula,
} from "@/modules/comercial/proposta-composta/actions";
import { ROTULO_SECAO, SECOES_ORDEM } from "@/modules/comercial/proposta-composta/modelos";
import { CAMPOS_PROPOSTA } from "@/modules/comercial/proposta-composta/campos";
import type { ClausulaDaLista, ModeloDaLista } from "@/modules/comercial/proposta-composta/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Biblioteca de cláusulas + modelos de proposta (ADR-0006, G3) — tela da gestão
 * (`comercial:modelos`).
 *
 * O texto daqui é a origem do que o cliente lê. Duas coisas a tela deixa explícitas, porque são
 * as que causam dano silencioso:
 * - **UF**: cláusula presa a um estado nunca é oferecida a obra de outro (foi assim que o COSCIP
 *   de Pernambuco foi parar em proposta de Alagoas).
 * - **Modelo com cláusula quebrada**: slug que não resolve faz a seção nascer vazia; aparece
 *   como aviso no card, não some.
 */

type Disciplina = { id: string; nome: string };

export function ModelosPropostaView({
  clausulas,
  modelos,
  disciplinas,
}: {
  clausulas: ClausulaDaLista[];
  modelos: ModeloDaLista[];
  disciplinas: Disciplina[];
}) {
  const [aba, setAba] = useState<"clausulas" | "modelos">("clausulas");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Modelos de proposta</h2>
        <p className="text-sm text-muted-foreground">
          O texto padrão que entra nas propostas. Editar uma cláusula aqui muda as próximas
          propostas — as já enviadas ficam como estão, porque cada proposta guarda a própria cópia.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant={aba === "clausulas" ? "default" : "outline"} size="sm" onClick={() => setAba("clausulas")}>
          <FileText className="size-4" /> Cláusulas ({clausulas.length})
        </Button>
        <Button variant={aba === "modelos" ? "default" : "outline"} size="sm" onClick={() => setAba("modelos")}>
          <Layers className="size-4" /> Modelos ({modelos.length})
        </Button>
      </div>

      {aba === "clausulas" ? (
        <Clausulas clausulas={clausulas} disciplinas={disciplinas} />
      ) : (
        <Modelos modelos={modelos} />
      )}
    </div>
  );
}

function Clausulas({ clausulas, disciplinas }: { clausulas: ClausulaDaLista[]; disciplinas: Disciplina[] }) {
  const [secaoFiltro, setSecaoFiltro] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ClausulaDaLista | null>(null);
  const [criando, setCriando] = useState(false);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clausulas.filter((c) => {
      if (secaoFiltro !== "todas" && c.secao !== secaoFiltro) return false;
      if (!q) return true;
      return `${c.titulo} ${c.texto} ${c.disciplinaNome ?? ""} ${c.uf ?? ""}`.toLowerCase().includes(q);
    });
  }, [clausulas, secaoFiltro, busca]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar no texto das cláusulas…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select value={secaoFiltro} onValueChange={(v) => setSecaoFiltro(v ?? "todas")}>
          <SelectTrigger className="w-60" aria-label="Filtrar por seção">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as seções</SelectItem>
            {SECOES_ORDEM.map((s) => (
              <SelectItem key={s} value={s}>
                {ROTULO_SECAO[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setCriando(true)}>
          <Plus className="size-4" /> Nova cláusula
        </Button>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma cláusula"
          description={
            busca || secaoFiltro !== "todas"
              ? "Nenhuma cláusula bate com o filtro."
              : "Crie a primeira cláusula da biblioteca."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtradas.map((c) => (
            <ClausulaLinha key={c.id} c={c} onEditar={() => setEditando(c)} />
          ))}
        </div>
      )}

      {(criando || editando) && (
        <ClausulaDialog
          clausula={editando}
          disciplinas={disciplinas}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function ClausulaLinha({ c, onEditar }: { c: ClausulaDaLista; onEditar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  async function alternar() {
    // `await confirm()` SEMPRE fora do startTransition (React 19 suspende o setState da action).
    if (c.ativo) {
      const usada = c.usadaEmModelos > 0;
      const ok = await confirm({
        title: "Desativar cláusula?",
        description: usada
          ? `Esta cláusula é o padrão de ${c.usadaEmModelos} modelo(s). Desativada, a seção desses modelos passa a nascer em branco.`
          : "Ela deixa de aparecer para quem monta proposta. O texto já copiado para propostas não muda.",
        confirmLabel: "Desativar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = await alternarClausula({ id: c.id, ativo: !c.ativo });
      if (r.ok) {
        toast.success(c.ativo ? "Cláusula desativada." : "Cláusula reativada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className={`rounded-sm border p-3 ${c.ativo ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {ROTULO_SECAO[c.secao as keyof typeof ROTULO_SECAO] ?? c.secao}
        </span>
        <strong className="text-sm">{c.titulo}</strong>
        {c.disciplinaNome && <StatusBadge tone="neutral">{c.disciplinaNome}</StatusBadge>}
        {c.uf && <StatusBadge tone="info">Só {c.uf}</StatusBadge>}
        {!c.ativo && <StatusBadge tone="neutral">Desativada</StatusBadge>}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Editar cláusula" onClick={onEditar} disabled={pending}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={c.ativo ? "Desativar cláusula" : "Reativar cláusula"}
            title={c.ativo ? "Desativar" : "Reativar"}
            onClick={alternar}
            disabled={pending}
          >
            {c.ativo ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </div>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.texto}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {c.usadaEmModelos > 0 ? `Padrão de ${c.usadaEmModelos} modelo(s). ` : ""}
        {c.usadaEmPropostas > 0 ? `Já copiada em ${c.usadaEmPropostas} proposta(s). ` : ""}
        <span className="font-mono">{c.slug}</span>
      </p>
    </div>
  );
}

function ClausulaDialog({
  clausula,
  disciplinas,
  onFechar,
}: {
  clausula: ClausulaDaLista | null;
  disciplinas: Disciplina[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [secao, setSecao] = useState(clausula?.secao ?? "escopo");
  const [titulo, setTitulo] = useState(clausula?.titulo ?? "");
  const [texto, setTexto] = useState(clausula?.texto ?? "");
  const [disciplinaId, setDisciplinaId] = useState(clausula?.disciplinaId ?? "");
  const [uf, setUf] = useState(clausula?.uf ?? "");
  const [ordem, setOrdem] = useState(String(clausula?.ordem ?? 0));

  function salvar() {
    start(async () => {
      const dados = {
        secao: secao as (typeof SECOES_ORDEM)[number],
        titulo,
        texto,
        disciplinaId: disciplinaId || undefined,
        uf: uf || undefined,
        ordem: Number(ordem) || 0,
      };
      const r = clausula ? await editarClausula({ ...dados, id: clausula.id }) : await criarClausula(dados);
      if (r.ok) {
        toast.success(clausula ? "Cláusula salva." : "Cláusula criada.");
        onFechar();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{clausula ? "Editar cláusula" : "Nova cláusula"}</DialogTitle>
          <DialogDescription>
            O texto sai na proposta como está aqui. Use os campos entre colchetes para os dados que
            mudam a cada proposta.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cl-secao">Seção</Label>
              <Select value={secao} onValueChange={(v) => setSecao(v ?? secao)}>
                <SelectTrigger id="cl-secao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECOES_ORDEM.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ROTULO_SECAO[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-titulo">Nome interno</Label>
              <Input
                id="cl-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Não incluso — padrão"
              />
              <p className="text-xs text-muted-foreground">Só para achar na lista; não sai na proposta.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-texto">Texto</Label>
            <textarea
              id="cl-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <p className="text-xs text-muted-foreground">
              Campos disponíveis:{" "}
              {CAMPOS_PROPOSTA.map((c) => `[${c.chave}]`).join(" · ")}. Não escreva telefone,
              e-mail, CNPJ ou dados bancários: eles vêm de Configurações → Empresa.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-disc">Disciplina</Label>
              <Select value={disciplinaId} onValueChange={(v) => setDisciplinaId(v ?? "")}>
                <SelectTrigger id="cl-disc">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as disciplinas</SelectItem>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-uf">UF (opcional)</Label>
              <Input
                id="cl-uf"
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="PE"
                maxLength={2}
              />
              <p className="text-xs text-muted-foreground">
                Preencha só quando o texto citar norma ou órgão do estado. Obra de outro estado
                nunca recebe esta cláusula.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-ordem">Ordem</Label>
              <Input
                id="cl-ordem"
                type="number"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                className="w-24"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Modelos({ modelos }: { modelos: ModeloDaLista[] }) {
  if (modelos.length === 0) {
    return <EmptyState icon={Layers} title="Nenhum modelo" description="Rode o seed ou crie um modelo." />;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {modelos.map((m) => (
        <ModeloCard key={m.id} m={m} />
      ))}
    </div>
  );
}

function ModeloCard({ m }: { m: ModeloDaLista }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const soma = m.pagamento.reduce((s, p) => s + p.percentual, 0);

  async function alternar() {
    if (m.ativo) {
      const ok = await confirm({
        title: "Desativar modelo?",
        description: "Ele deixa de aparecer na criação de propostas. As propostas já criadas com ele não mudam.",
        confirmLabel: "Desativar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = await alternarModeloProposta({ id: m.id, ativo: !m.ativo });
      if (r.ok) {
        toast.success(m.ativo ? "Modelo desativado." : "Modelo reativado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card className={m.ativo ? "" : "opacity-60"}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {m.nome}
          {m.familia && <StatusBadge tone="neutral">{m.familia}</StatusBadge>}
          {!m.ativo && <StatusBadge tone="neutral">Desativado</StatusBadge>}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label={m.ativo ? "Desativar modelo" : "Reativar modelo"}
            title={m.ativo ? "Desativar" : "Reativar"}
            onClick={alternar}
            disabled={pending}
          >
            {m.ativo ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </CardTitle>
        <CardDescription>
          {m.descricao} · validade de {m.validadeDias} dias
          {m.usadoEmPropostas > 0 ? ` · usado em ${m.usadoEmPropostas} proposta(s)` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {m.problemas.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {m.problemas.map((p) => `${p.clausulaSlug} (${p.motivo})`).join(", ")} — a seção
              correspondente nasce em branco na proposta.
            </span>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seções</p>
          <ol className="space-y-0.5 text-sm">
            {m.secoes.map((s, i) => (
              <li key={`${s.secao}-${i}`} className="flex items-center gap-2">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>{s.titulo}</span>
                {!s.temTexto && <StatusBadge tone="warning">sem texto</StatusBadge>}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plano de pagamento sugerido
          </p>
          {m.pagamento.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem plano sugerido.</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {m.pagamento.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{p.descricao}</span>
                  <span className="font-mono tabular-nums">{String(p.percentual).replace(".", ",")}%</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 border-t pt-0.5 text-xs text-muted-foreground">
                <span>Soma</span>
                <span className={`font-mono tabular-nums ${soma === 100 ? "" : "text-destructive"}`}>
                  {String(Math.round(soma * 100) / 100).replace(".", ",")}%
                </span>
              </li>
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
