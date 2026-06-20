"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Link2, Copy, Save, Inbox } from "lucide-react";
import {
  adicionarInput,
  removerInput,
  responderInputs,
  gerarLinkInput,
  aplicarInputsPadrao,
} from "@/modules/inputs/actions";
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

export function InputsPanel({
  projetoId,
  podeGerir,
  disciplinas,
  itens,
  progresso,
  token,
  baseUrl,
}: {
  projetoId: string;
  podeGerir: boolean;
  disciplinas: string[];
  itens: Item[];
  progresso: { total: number; respondidas: number };
  token: string | null;
  baseUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novaPergunta, setNovaPergunta] = useState("");
  const [novaDisc, setNovaDisc] = useState("__geral");
  // Sem perguntas → seção começa colapsada (não ocupa espaço com bloco grande vazio).
  const [aberto, setAberto] = useState(itens.length > 0);
  const [respostas, setRespostas] = useState<Record<string, string>>(
    Object.fromEntries(itens.map((i) => [i.id, i.resposta])),
  );

  const linkUrl = token ? `${baseUrl}/p/inputs/${token}` : null;

  function adicionar() {
    if (!novaPergunta.trim()) return;
    start(async () => {
      const res = await adicionarInput({
        projetoId,
        disciplina: novaDisc === "__geral" ? undefined : novaDisc,
        pergunta: novaPergunta,
      });
      if (res.ok) {
        toast.success("Pergunta adicionada.");
        setNovaPergunta("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const res = await removerInput({ id });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  function salvarRespostas() {
    start(async () => {
      const res = await responderInputs({
        projetoId,
        respostas: itens.map((i) => ({ id: i.id, resposta: respostas[i.id] ?? "" })),
      });
      if (res.ok) toast.success("Respostas salvas.");
      else toast.error(res.error);
    });
  }

  function gerarLink() {
    start(async () => {
      const res = await gerarLinkInput({ projetoId });
      if (res.ok) {
        toast.success("Link gerado.");
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

  async function copiar() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    toast.success("Link copiado.");
  }

  // Estado vazio + colapsado: card compacto com 1 botão para expandir (ou apenas o aviso).
  if (itens.length === 0 && !aberto) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Inputs do projeto</CardTitle>
            <CardDescription>Nenhuma pergunta definida ainda.</CardDescription>
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
            <CardTitle className="text-base">Inputs do projeto</CardTitle>
            <CardDescription>
              {progresso.respondidas}/{progresso.total} respondida(s)
            </CardDescription>
          </div>
          {podeGerir && (
            <div className="flex items-center gap-2">
              {linkUrl ? (
                <Button variant="outline" size="sm" onClick={copiar}>
                  <Copy className="size-3.5" /> Copiar link
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={aplicarPadrao} disabled={pending}>
                <Plus className="size-3.5" /> Aplicar padrão
              </Button>
              <Button variant="outline" size="sm" onClick={gerarLink} disabled={pending}>
                <Link2 className="size-3.5" /> {token ? "Regerar link" : "Gerar link público"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkUrl && podeGerir && (
          <p className="break-all rounded-sm bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {linkUrl}
          </p>
        )}

        {itens.length === 0 ? (
          <EmptyState icon={Inbox} title="Nenhuma pergunta definida." />
        ) : (
          <ul className="space-y-3">
            {itens.map((it) => (
              <li key={it.id} className="space-y-1.5 rounded-sm border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{it.pergunta}</p>
                    <p className="text-xs text-muted-foreground">{it.disciplina ?? "Geral"}</p>
                  </div>
                  {podeGerir && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remover(it.id)}
                      aria-label="Remover"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {podeGerir ? (
                  <textarea
                    rows={2}
                    className="w-full resize-y rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    value={respostas[it.id] ?? ""}
                    onChange={(e) =>
                      setRespostas((r) => ({ ...r, [it.id]: e.target.value }))
                    }
                    placeholder="Resposta (preenchida pelo cliente ou pela equipe)"
                  />
                ) : (
                  <p className="rounded-sm bg-muted px-3 py-2 text-sm">
                    {it.resposta || <span className="text-muted-foreground">Sem resposta</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeGerir && (
          <>
            {itens.length > 0 && (
              <Button size="sm" onClick={salvarRespostas} disabled={pending}>
                <Save className="size-3.5" /> Salvar respostas
              </Button>
            )}
            <div className="space-y-2 rounded-sm border border-dashed p-3">
              <Label className="text-xs text-muted-foreground">Nova pergunta</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={novaDisc} onValueChange={(v) => setNovaDisc(v ?? "__geral")}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geral">Geral</SelectItem>
                    {disciplinas.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  placeholder="Texto da pergunta…"
                  value={novaPergunta}
                  onChange={(e) => setNovaPergunta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
                <Button size="sm" onClick={adicionar} disabled={pending}>
                  <Plus className="size-3.5" /> Adicionar
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
