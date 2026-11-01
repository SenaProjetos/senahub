"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Inbox, RotateCcw, Check, X } from "lucide-react";
import {
  adicionarInput,
  editarInput,
  removerInput,
  restaurarInput,
  responderInputs,
  aplicarInputsPadrao,
} from "@/modules/inputs/actions";
import { itensDaPergunta } from "@/modules/inputs/acoes";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Item = { id: string; disciplina: string | null; pergunta: string; resposta: string };

const GERAL = "__geral";

function SeletorDisciplina({
  value,
  onChange,
  disciplinas,
  rotulo,
}: {
  value: string;
  onChange: (v: string) => void;
  disciplinas: string[];
  rotulo: string;
}) {
  // Disciplina gravada que saiu do projeto continua escolhível (senão o Select fica em branco).
  const opcoes = value !== GERAL && !disciplinas.includes(value) ? [...disciplinas, value] : disciplinas;
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? GERAL)}>
      <SelectTrigger className="w-44" aria-label={rotulo}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={GERAL}>Geral</SelectItem>
        {opcoes.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InputsPanel({
  projetoId,
  podeGerir,
  disciplinas,
  itens,
  removidos,
  progresso,
}: {
  projetoId: string;
  podeGerir: boolean;
  disciplinas: string[];
  itens: Item[];
  /** Perguntas removidas do formulário (só chega para quem pode gerir). */
  removidos: Item[];
  progresso: { total: number; respondidas: number };
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [novaPergunta, setNovaPergunta] = useState("");
  const [novaDisc, setNovaDisc] = useState(GERAL);
  // Sem perguntas → seção começa colapsada (não ocupa espaço com bloco grande vazio).
  const [aberto, setAberto] = useState(itens.length > 0 || removidos.length > 0);
  // Só o que a equipe digitou; o resto lê a resposta gravada (pergunta nova ou restaurada).
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [edicao, setEdicao] = useState<{ id: string; pergunta: string; disciplina: string } | null>(null);

  const respostaDe = (it: Item) => respostas[it.id] ?? it.resposta;

  function rodar(fn: () => Promise<{ ok: boolean; error?: string }>, sucesso: string, depois?: () => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(sucesso);
        depois?.();
      } else toast.error(r.error ?? "Não foi possível concluir.");
      // Também na recusa: outra pessoa pode ter removido ou restaurado a pergunta.
      router.refresh();
    });
  }

  function esquecerRascunho(id: string) {
    setRespostas((r) => {
      const resto = { ...r };
      delete resto[id];
      return resto;
    });
  }

  function adicionar() {
    if (pending || !novaPergunta.trim()) return;
    rodar(
      () =>
        adicionarInput({
          projetoId,
          disciplina: novaDisc === GERAL ? undefined : novaDisc,
          pergunta: novaPergunta,
        }),
      "Pergunta adicionada.",
      () => setNovaPergunta(""),
    );
  }

  function salvarEdicao() {
    if (pending || !edicao || !edicao.pergunta.trim()) return;
    const { id, pergunta, disciplina } = edicao;
    rodar(
      () => editarInput({ projetoId, id, pergunta, disciplina: disciplina === GERAL ? undefined : disciplina }),
      "Pergunta atualizada.",
      () => setEdicao(null),
    );
  }

  // Só o que a equipe mexeu: uma resposta que o cliente deu pelo link depois que a tela abriu
  // não é sobrescrita pelo valor velho.
  const editadas = itens.filter((i) => respostas[i.id] !== undefined && respostas[i.id] !== i.resposta);

  function salvarRespostas() {
    if (editadas.length === 0) {
      toast.info("Nenhuma resposta alterada.");
      return;
    }
    start(async () => {
      const res = await responderInputs({
        projetoId,
        respostas: editadas.map((i) => ({ id: i.id, resposta: respostas[i.id] })),
      });
      if (res.ok) {
        if (res.data.ignoradas > 0) {
          toast.warning(`${res.data.ignoradas} resposta(s) não salva(s): a pergunta foi removida do formulário.`);
        } else toast.success("Respostas salvas.");
        setRespostas({});
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function aplicarPadrao() {
    start(async () => {
      const res = await aplicarInputsPadrao({ projetoId });
      if (res.ok) {
        toast.success(res.data.criados > 0 ? `${res.data.criados} input(s) padrão adicionado(s).` : "Nenhum input padrão novo.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  async function aoSelecionar(it: Item, acao: AcaoItemAcao) {
    // Confirmar ANTES do startTransition (await dentro da transição trava o diálogo).
    if (acao.confirmar) {
      const ok = await confirm({
        title: acao.confirmar.titulo,
        description: acao.confirmar.descricao,
        confirmLabel: acao.confirmar.rotuloConfirmar,
        variant: "destructive",
      });
      if (!ok) return;
    }
    if (acao.id === "editar") setEdicao({ id: it.id, pergunta: it.pergunta, disciplina: it.disciplina ?? GERAL });
    else if (acao.id === "remover") {
      rodar(() => removerInput({ projetoId, id: it.id }), "Pergunta removida do formulário.", () => esquecerRascunho(it.id));
    }
  }

  function linhaEmEdicao(it: Item) {
    if (!edicao) return null;
    return (
      <li key={it.id} className="space-y-2 rounded-sm border border-primary/40 p-3">
        <Label htmlFor={`editar-${it.id}`} className="text-xs text-muted-foreground">
          Editar pergunta
        </Label>
        <Input
          id={`editar-${it.id}`}
          autoFocus
          value={edicao.pergunta}
          onChange={(e) => setEdicao({ ...edicao, pergunta: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvarEdicao();
            if (e.key === "Escape") setEdicao(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SeletorDisciplina
            value={edicao.disciplina}
            onChange={(v) => setEdicao({ ...edicao, disciplina: v })}
            disciplinas={disciplinas}
            rotulo="Disciplina da pergunta"
          />
          <Button size="sm" onClick={salvarEdicao} disabled={pending || !edicao.pergunta.trim()}>
            <Check className="size-3.5" /> Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdicao(null)} disabled={pending}>
            <X className="size-3.5" /> Cancelar
          </Button>
        </div>
      </li>
    );
  }

  function linha(it: Item) {
    if (edicao?.id === it.id) return linhaEmEdicao(it);
    const acoes = itensDaPergunta({ resposta: respostaDe(it) }, podeGerir);
    return (
      <LinhaComMenu
        key={it.id}
        itens={acoes}
        onSelect={(a) => aoSelecionar(it, a)}
        render={<li className="space-y-1.5 rounded-sm border p-3 data-[popup-open]:bg-muted/30" />}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{it.pergunta}</p>
            <p className="text-xs text-muted-foreground">{it.disciplina ?? "Geral"}</p>
          </div>
          <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionar(it, a)} rotulo={`Ações da pergunta ${it.pergunta}`} />
        </div>
        {podeGerir ? (
          <textarea
            rows={2}
            aria-label={`Resposta: ${it.pergunta}`}
            className="w-full resize-y rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            value={respostaDe(it)}
            onChange={(e) => setRespostas((r) => ({ ...r, [it.id]: e.target.value }))}
            placeholder="Resposta (preenchida pelo cliente ou pela equipe)"
          />
        ) : (
          <p className="rounded-sm bg-muted px-3 py-2 text-sm">
            {it.resposta || <span className="text-muted-foreground">Sem resposta</span>}
          </p>
        )}
      </LinhaComMenu>
    );
  }

  // Estado vazio + colapsado: card compacto com 1 botão para expandir (ou apenas o aviso).
  if (itens.length === 0 && !aberto) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Perguntas extras</CardTitle>
            <CardDescription>Perguntas avulsas além do briefing — nenhuma definida ainda.</CardDescription>
          </div>
          {podeGerir && (
            <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          )}
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Perguntas extras</CardTitle>
            <CardDescription>
              Perguntas avulsas (além do briefing) · {progresso.respondidas}/{progresso.total} respondida(s)
            </CardDescription>
          </div>
          {podeGerir && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={aplicarPadrao} disabled={pending}>
                <Plus className="size-3.5" /> Aplicar padrão
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {itens.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={removidos.length > 0 ? "Nenhuma pergunta no formulário — restaure em Perguntas removidas." : "Nenhuma pergunta definida."}
          />
        ) : (
          <ul className="space-y-3">{itens.map(linha)}</ul>
        )}

        {podeGerir && (
          <>
            {itens.length > 0 && (
              <Button size="sm" onClick={salvarRespostas} disabled={pending || editadas.length === 0}>
                <Save className="size-3.5" /> Salvar respostas
              </Button>
            )}
            <div className="space-y-2 rounded-sm border border-dashed p-3">
              <Label className="text-xs text-muted-foreground">Nova pergunta</Label>
              <div className="flex flex-wrap items-center gap-2">
                <SeletorDisciplina
                  value={novaDisc}
                  onChange={setNovaDisc}
                  disciplinas={disciplinas}
                  rotulo="Disciplina da nova pergunta"
                />
                <Input
                  className="min-w-48 flex-1"
                  placeholder="Texto da pergunta…"
                  aria-label="Texto da nova pergunta"
                  value={novaPergunta}
                  onChange={(e) => setNovaPergunta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
                <Button size="sm" onClick={adicionar} disabled={pending}>
                  <Plus className="size-3.5" /> Adicionar
                </Button>
              </div>
            </div>

            {removidos.length > 0 && (
              <CollapsibleSection
                titulo={`Perguntas removidas (${removidos.length})`}
                descricao="Fora da tela e do link do cliente. Restaurar devolve a pergunta com a resposta; o padrão não as recria."
              >
                <ul className="divide-y rounded-sm border">
                  {removidos.map((it) => (
                    <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">{it.pergunta}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.disciplina ?? "Geral"}
                          {it.resposta && " · tem resposta guardada"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          rodar(() => restaurarInput({ projetoId, id: it.id }), "Pergunta restaurada.")
                        }
                      >
                        <RotateCcw className="size-3.5" /> Restaurar
                      </Button>
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
