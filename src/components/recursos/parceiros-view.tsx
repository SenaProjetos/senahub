"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import type { ParceiroNaLista } from "@/modules/planejamento/parceiros/queries";
import { motivoDoNomeParceiro, motivoParaNaoExcluirParceiro } from "@/modules/planejamento/parceiros/regras";
import {
  criarParceiroAction,
  definirParceiroAtivoAction,
  editarParceiroAction,
  excluirParceiroAction,
} from "@/modules/planejamento/parceiros/actions";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { AbasRecursos } from "@/components/recursos/abas-recursos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

const SEM = "__sem";

type Edicao = { id: string | null; nome: string; disciplinaId: string | null; disciplina: string | null; ativo: boolean; tarefas: number };

/**
 * Aba "Parceiros externos" de Recursos (pool de recursos, parte 6 — decisão 4): o cadastro simples (nome e disciplina) que
 * dá nome à etapa de terceiro na EAP ("Externo: Eqp. Climatização"). Sem horas e sem alerta: na tela por pessoa o parceiro
 * tem faixa própria, só com os prazos.
 */
export function ParceirosView({
  parceiros,
  disciplinas,
  podeGerir,
}: {
  parceiros: ParceiroNaLista[];
  disciplinas: { id: string; nome: string }[];
  podeGerir: boolean;
}) {
  const [editando, setEditando] = useState<Edicao | null>(null);
  const novo = () => setEditando({ id: null, nome: "", disciplinaId: null, disciplina: null, ativo: true, tarefas: 0 });

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo="Recursos"
        descricao="Parceiros externos: quem executa a etapa de terceiro fora da casa. Só prazos, sem horas e sem alerta."
        acoes={
          podeGerir ? (
            <Button size="sm" onClick={novo}>
              <Plus className="size-4" /> Novo parceiro
            </Button>
          ) : undefined
        }
      />
      <AbasRecursos atual="parceiros" />

      {parceiros.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum parceiro cadastrado"
          description='Cadastre a equipe de fora (ex.: "Eqp. Climatização") para dar nome à etapa de terceiro na EAP.'
          className="rounded-sm border"
          action={
            podeGerir ? (
              <Button size="sm" variant="outline" onClick={novo}>
                <Plus className="size-4" /> Novo parceiro
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="relative max-w-full overflow-x-auto rounded-sm border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Parceiros externos</caption>
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Disciplina
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Tarefas abertas
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Situação
                </th>
                {podeGerir && (
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {parceiros.map((p) => (
                <tr key={p.id} className={p.ativo ? undefined : "text-muted-foreground"}>
                  <td className="px-3 py-2 font-medium">{p.nome}</td>
                  <td className="px-3 py-2">{p.disciplina ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.abertas}
                    {p.tarefas > p.abertas && <span className="text-xs text-muted-foreground"> (de {p.tarefas})</span>}
                  </td>
                  <td className="px-3 py-2">{p.ativo ? "Ativo" : "Arquivado"}</td>
                  {podeGerir && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Editar ${p.nome}`}
                        onClick={() => setEditando({ id: p.id, nome: p.nome, disciplinaId: p.disciplinaId, disciplina: p.disciplina, ativo: p.ativo, tarefas: p.tarefas })}
                      >
                        Editar
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && <ParceiroDialog key={editando.id ?? "novo"} inicial={editando} disciplinas={disciplinas} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function ParceiroDialog({
  inicial,
  disciplinas,
  onFechar,
}: {
  inicial: Edicao;
  disciplinas: { id: string; nome: string }[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState(inicial.nome);
  const [disciplinaId, setDisciplinaId] = useState<string | null>(inicial.disciplinaId);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const motivoExcluir = motivoParaNaoExcluirParceiro(inicial.tarefas);
  // A disciplina gravada que saiu do catálogo ativo continua na lista (senão o campo parece vazio e a gravação a manteria escondida).
  const opcoesDisciplina =
    inicial.disciplinaId && !disciplinas.some((d) => d.id === inicial.disciplinaId)
      ? [{ id: inicial.disciplinaId, nome: `${inicial.disciplina ?? "Disciplina"} (inativa)` }, ...disciplinas]
      : disciplinas;

  const terminou = (ok: boolean, erro?: string, mensagem?: string) => {
    if (!ok) return void toast.error(erro ?? "Não foi possível salvar.");
    if (mensagem) toast.success(mensagem);
    onFechar();
    router.refresh();
  };

  function salvar() {
    const motivo = motivoDoNomeParceiro(nome);
    if (motivo) return setErroNome(motivo);
    start(async () => {
      const r = inicial.id ? await editarParceiroAction({ id: inicial.id, nome, disciplinaId }) : await criarParceiroAction({ nome, disciplinaId });
      if (!r.ok && r.fieldErrors?.nome?.[0]) return setErroNome(r.fieldErrors.nome[0]);
      terminou(r.ok, r.ok ? undefined : r.error, inicial.id ? "Parceiro salvo." : "Parceiro cadastrado.");
    });
  }

  function arquivar() {
    if (!inicial.id) return;
    const id = inicial.id;
    start(async () => {
      const r = await definirParceiroAtivoAction({ id, ativo: !inicial.ativo });
      terminou(r.ok, r.ok ? undefined : r.error, inicial.ativo ? "Parceiro arquivado." : "Parceiro reativado.");
    });
  }

  async function excluir() {
    if (!inicial.id) return;
    const id = inicial.id;
    const ok = await confirm({ title: `Excluir ${inicial.nome}?`, description: "O parceiro sai da lista. Ele não está em nenhuma tarefa.", confirmLabel: "Excluir" });
    if (!ok) return;
    start(async () => {
      const r = await excluirParceiroAction({ id });
      terminou(r.ok, r.ok ? undefined : r.error, "Parceiro excluído.");
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar parceiro externo" : "Novo parceiro externo"}</DialogTitle>
          <DialogDescription>Dá nome à etapa de terceiro na EAP. Sem horas e sem alerta de carga.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="parceiro-nome">Nome</Label>
            <Input
              id="parceiro-nome"
              value={nome}
              maxLength={80}
              placeholder="Ex.: Eqp. Climatização"
              aria-invalid={!!erroNome}
              aria-describedby={erroNome ? "parceiro-nome-erro" : undefined}
              onChange={(e) => {
                setNome(e.target.value);
                setErroNome(null);
              }}
            />
            {erroNome && (
              <p id="parceiro-nome-erro" className="text-xs text-destructive-text">
                {erroNome}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parceiro-disciplina">Disciplina</Label>
            <Select value={disciplinaId ?? SEM} onValueChange={(v) => setDisciplinaId(!v || v === SEM ? null : v)}>
              <SelectTrigger id="parceiro-disciplina" className="w-full">
                <SelectValue>{opcoesDisciplina.find((d) => d.id === disciplinaId)?.nome ?? "Sem disciplina"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem disciplina</SelectItem>
                {opcoesDisciplina.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {inicial.id && (
            <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
              <p>
                {inicial.ativo
                  ? "Arquivar tira o parceiro das escolhas da EAP; as tarefas que já o têm seguem com o nome."
                  : "Arquivado: não aparece nas escolhas da EAP."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={arquivar}>
                  {inicial.ativo ? "Arquivar" : "Reativar"}
                </Button>
                <Button size="sm" variant="outline" disabled={pending || !!motivoExcluir}
                  aria-describedby={motivoExcluir ? "parceiro-excluir-motivo" : undefined}
                  onClick={() => void excluir()}
                >
                  Excluir
                </Button>
              </div>
              {motivoExcluir && <p id="parceiro-excluir-motivo">{motivoExcluir}</p>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending} aria-busy={pending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
