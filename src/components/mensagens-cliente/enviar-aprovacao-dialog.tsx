"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { carregarFormularioAprovacao, enviarAprovacaoEntrega } from "@/modules/portal/aprovacao-entrega/actions";
import type { FormularioDeEnvio } from "@/modules/portal/aprovacao-entrega/queries";
import type { Candidato } from "@/modules/portal/aprovacao-entrega/itens";
import { MENSAGEM_MAX, TITULO_MAX } from "@/modules/portal/aprovacao-entrega/regras";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CollapsibleSection } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Grupo = { chave: string; disciplina: string; fase: string; itens: Candidato[] };

function agrupar(candidatos: Candidato[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const c of candidatos) {
    const chave = `${c.disciplinaId}|${c.faseChave}`;
    const g = grupos.get(chave) ?? { chave, disciplina: c.disciplinaNome, fase: c.faseRotulo, itens: [] };
    g.itens.push(c);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

const CLASSE_TEXTAREA =
  "w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Enviar para aprovação" na aba Cliente: título, mensagem, os arquivos das Entregas do cliente (por disciplina e fase,
 * com "Marcar a fase") e, se houver, a parcela do contrato que o aceite sinaliza. O formulário é lido ao abrir (as
 * Entregas mudam). O servidor confere tudo de novo.
 */
export function EnviarAprovacaoDialog({ projetoId }: { projetoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormularioDeEnvio | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [parcelaId, setParcelaId] = useState<string>("");
  const [enviando, startTransition] = useTransition();
  const idTitulo = useId();
  const idMensagem = useId();
  const grupos = useMemo(() => agrupar(form?.candidatos ?? []), [form]);

  function carregar() {
    setForm(null);
    setErroCarga(null);
    void carregarFormularioAprovacao({ projetoId })
      .then((r) => (r.ok ? setForm(r.data) : setErroCarga(r.error)))
      .catch(() => setErroCarga("Não foi possível carregar as Entregas."));
  }

  function abrir() {
    setAberto(true);
    setTitulo("");
    setMensagem("");
    setMarcados(new Set());
    setParcelaId("");
    carregar();
  }

  function alternar(ids: string[], marcar: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const id of ids) {
        if (marcar) novo.add(id);
        else novo.delete(id);
      }
      return novo;
    });
  }

  function enviar() {
    startTransition(async () => {
      const r = await enviarAprovacaoEntrega({
        projetoId,
        titulo,
        mensagem: mensagem || null,
        uploadIds: [...marcados],
        parcelaId: parcelaId || null,
      }).catch(() => null);
      if (!r) {
        toast.error("Não foi possível enviar. Verifique a conexão e tente de novo.");
        return;
      }
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Pedido de aprovação enviado.");
      setAberto(false);
      router.refresh();
    });
  }

  const podeEnviar = !enviando && titulo.trim().length > 0 && marcados.size > 0;
  const parcelaEscolhida = form?.parcelas.find((p) => p.id === parcelaId)?.rotulo ?? "Nenhuma";

  return (
    <>
      <Button size="sm" onClick={abrir}>
        <Send className="size-4" aria-hidden /> Enviar para aprovação
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !enviando && setAberto(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar entrega para aprovação</DialogTitle>
            <DialogDescription>
              O cliente recebe no portal e responde: Aprovo, Aprovo com ressalvas ou Não aprovo. O pedido não muda depois de
              enviado.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={idTitulo}>Título</Label>
              <Input
                id={idTitulo}
                value={titulo}
                maxLength={TITULO_MAX}
                placeholder="Ex.: Entrega BS — Estrutural e Hidráulica"
                onChange={(e) => setTitulo(e.target.value)}
                disabled={enviando}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={idMensagem}>Mensagem ao cliente (opcional)</Label>
              <textarea
                id={idMensagem}
                rows={3}
                maxLength={MENSAGEM_MAX}
                className={CLASSE_TEXTAREA}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                disabled={enviando}
              />
            </div>

            {erroCarga && (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                <span>{erroCarga}</span>
                <Button size="sm" variant="outline" onClick={carregar}>
                  Tentar de novo
                </Button>
              </div>
            )}
            {!form && !erroCarga && (
              <div className="space-y-2" aria-busy="true">
                <span className="sr-only" role="status">
                  Carregando as Entregas…
                </span>
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
            {form && form.contasAtivas === 0 && (
              <p className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text">
                Este cliente não tem conta ativa no portal: registre a resposta por fora.
              </p>
            )}
            {form && grupos.length === 0 && (
              <p className="rounded-sm border border-dashed px-3 py-3 text-sm text-muted-foreground">Nada nas Entregas do cliente ainda.</p>
            )}
            {form && grupos.length > 0 && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  Arquivos das Entregas <span className="font-normal text-muted-foreground">({marcados.size} escolhido(s))</span>
                </legend>
                {grupos.map((g) => {
                  const ids = g.itens.map((i) => i.uploadId);
                  const todos = ids.every((id) => marcados.has(id));
                  return (
                    <div key={g.chave} className="rounded-sm border">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                        <span className="text-sm font-medium">
                          {g.disciplina} · {g.fase}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => alternar(ids, !todos)} disabled={enviando}>
                          {todos ? "Desmarcar a fase" : "Marcar a fase"}
                        </Button>
                      </div>
                      <ul className="divide-y">
                        {g.itens.map((i) => (
                          <li key={i.uploadId}>
                            <label className="flex min-w-0 items-start gap-2 px-3 py-2 text-sm">
                              <Checkbox
                                className="mt-0.5"
                                checked={marcados.has(i.uploadId)}
                                onCheckedChange={(v) => alternar([i.uploadId], v === true)}
                                disabled={enviando}
                              />
                              <span className="min-w-0 break-all">
                                {i.nomeArquivo} <span className="text-xs text-muted-foreground">{i.revisaoRotulo}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </fieldset>
            )}

            {form && form.parcelas.length > 0 && (
              <CollapsibleSection
                titulo="Parcela do contrato (opcional)"
                descricao="Em Parcelas a faturar, a parcela mostra se o cliente já aceitou. Nada trava nem fatura sozinho."
                resumo={parcelaEscolhida}
              >
                <div role="radiogroup" aria-label="Parcela do contrato" className="space-y-1.5">
                  {[{ id: "", rotulo: "Nenhuma" }, ...form.parcelas].map((p) => (
                    <label key={p.id || "nenhuma"} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name={`parcela-${projetoId}`}
                        className="mt-1"
                        checked={parcelaId === p.id}
                        onChange={() => setParcelaId(p.id)}
                        disabled={enviando}
                      />
                      <span className="min-w-0 break-words">{p.rotulo}</span>
                    </label>
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={!podeEnviar}>
              <span role="status">{enviando ? "Enviando…" : "Enviar ao cliente"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
