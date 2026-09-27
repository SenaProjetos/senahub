"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, ArrowUp, ArrowDown, Tags, ChevronRight } from "lucide-react";
import {
  criarCargo, editarCargo, arquivarCargo, excluirCargo, reordenarCargos,
  criarDepartamento, editarDepartamento, arquivarDepartamento, excluirDepartamento, reordenarDepartamentos,
} from "@/modules/rh/catalogos/actions";
import { SETOR_VALUES } from "@/modules/rh/catalogos/schemas";
import { SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";
import type { CatalogosAdmin } from "@/modules/rh/catalogos/queries";
import { estruturaDoDepartamento, pessoasDoCargo, type PessoaCatalogo } from "@/modules/rh/catalogos/estrutura";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls =
  "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Setor = (typeof SETOR_VALUES)[number];
type Item = { id: string; nome: string; ativo: boolean; ordem: number; emUso: number; setor?: Setor | null };
type Tipo = "cargo" | "departamento";

/** Estado do dialog: `id` ausente = criação. */
type Edicao = { tipo: Tipo; id?: string; nome: string; setor: Setor | "" };

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/** Uma pessoa na estrutura: iniciais, nome (link para a ficha, se quem vê pode abri-la) e um detalhe. */
function PessoaNaEstrutura({ pessoa, detalhe, link }: { pessoa: PessoaCatalogo; detalhe?: string | null; link: boolean }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-sm border bg-background py-1 pr-2.5 pl-1 text-sm">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
        {iniciais(pessoa.nome)}
      </span>
      {link ? (
        <Link href={`/rh/pessoas/${pessoa.id}`} className="truncate hover:underline">
          {pessoa.nome}
        </Link>
      ) : (
        <span className="truncate">{pessoa.nome}</span>
      )}
      {detalhe && <span className="shrink-0 text-xs text-muted-foreground">· {detalhe}</span>}
    </li>
  );
}

function Inativas({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      + {n} {n === 1 ? "pessoa inativa, que conta em \"Em uso\" e não aparece aqui" : "pessoas inativas, que contam em \"Em uso\" e não aparecem aqui"}.
    </p>
  );
}

export function CatalogosView({ catalogos, podeAbrirFicha }: { catalogos: CatalogosAdmin; podeAbrirFicha: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState("");
  // Linhas abertas (`tipo:id`). Mora aqui, e as listas são funções de render, não componentes: um
  // componente definido dentro deste remontaria a cada render e perderia o foco da seta.
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const confirm = useConfirm();

  const nomeDepartamento = new Map(catalogos.departamentos.map((d) => [d.id, d.nome]));

  function alternarLinha(chave: string) {
    setAbertas((a) => {
      const prox = new Set(a);
      if (prox.has(chave)) prox.delete(chave);
      else prox.add(chave);
      return prox;
    });
  }

  function feito(msg: string) {
    toast.success(msg);
    setEdicao(null);
    setErro("");
    router.refresh();
  }

  function salvar() {
    if (!edicao) return;
    setErro("");
    start(async () => {
      const setor = edicao.setor === "" ? null : edicao.setor;
      const res = edicao.id
        ? edicao.tipo === "cargo"
          ? await editarCargo({ id: edicao.id, nome: edicao.nome })
          : await editarDepartamento({ id: edicao.id, nome: edicao.nome, setor })
        : edicao.tipo === "cargo"
          ? await criarCargo({ nome: edicao.nome })
          : await criarDepartamento({ nome: edicao.nome, setor });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      // Só as actions de edição devolvem quantas fichas tiveram o rótulo em cache atualizado.
      const d = res.data as { usuariosAtualizados?: number };
      const afetados = d.usuariosAtualizados ?? 0;
      feito(
        edicao.id
          ? afetados > 0
            ? `Renomeado. ${afetados} pessoa(s) tiveram o rótulo atualizado.`
            : "Renomeado."
          : "Item criado.",
      );
    });
  }

  function alternarArquivo(tipo: Tipo, it: Item) {
    start(async () => {
      const res = tipo === "cargo" ? await arquivarCargo({ id: it.id }) : await arquivarDepartamento({ id: it.id });
      if (res.ok) feito(it.ativo ? "Arquivado." : "Reativado.");
      else toast.error(res.error);
    });
  }

  async function excluir(tipo: Tipo, it: Item) {
    const ok = await confirm({
      title: `Excluir "${it.nome}"?`,
      description: "Remove o item do catálogo definitivamente. Só é possível quando ninguém o utiliza.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const res = tipo === "cargo" ? await excluirCargo({ id: it.id }) : await excluirDepartamento({ id: it.id });
      if (res.ok) feito("Item excluído.");
      else toast.error(res.error);
    });
  }

  /** Move um item uma posição e reenvia a lista inteira — o servidor normaliza `ordem` p/ 0..n-1. */
  function mover(tipo: Tipo, lista: Item[], indice: number, delta: number) {
    const alvo = indice + delta;
    if (alvo < 0 || alvo >= lista.length) return;
    const ids = lista.map((i) => i.id);
    [ids[indice], ids[alvo]] = [ids[alvo]!, ids[indice]!];
    start(async () => {
      const res = tipo === "cargo" ? await reordenarCargos({ ids }) : await reordenarDepartamentos({ ids });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  /** O que a linha aberta mostra: quem ocupa o cargo, ou os cargos e as pessoas do departamento. */
  function estrutura(tipo: Tipo, it: Item) {
    if (tipo === "cargo") {
      const { ativas, inativas } = pessoasDoCargo(catalogos.pessoas, it.id);
      return (
        <div className="space-y-2">
          {ativas.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {ativas.map((p) => (
                <PessoaNaEstrutura
                  key={p.id}
                  pessoa={p}
                  link={podeAbrirFicha}
                  detalhe={p.departamentoId ? nomeDepartamento.get(p.departamentoId) : null}
                />
              ))}
            </ul>
          )}
          <Inativas n={inativas} />
        </div>
      );
    }
    const { grupos, inativas } = estruturaDoDepartamento(catalogos.pessoas, it.id, catalogos.cargos);
    return (
      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.cargo?.id ?? "sem-cargo"} className="space-y-1.5 border-l pl-3">
            <p className="text-xs font-semibold">
              {g.cargo?.nome ?? "Sem cargo"}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">· {g.pessoas.length}</span>
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {g.pessoas.map((p) => (
                <PessoaNaEstrutura key={p.id} pessoa={p} link={podeAbrirFicha} />
              ))}
            </ul>
          </div>
        ))}
        <Inativas n={inativas} />
      </div>
    );
  }

  function lista({ tipo, itens, titulo, descricao }: { tipo: Tipo; itens: Item[]; titulo: string; descricao: string }) {
    const colunas = tipo === "departamento" ? 4 : 3;
    return (
      <Card>
        {/* O cabeçalho do Card é grade: o botão vai no `CardAction` (com `flex-row` ele virava uma barra
            da largura do título). */}
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
          <p className="text-sm text-muted-foreground">{descricao}</p>
          <CardAction>
            <Button
              size="sm"
              onClick={() => setEdicao({ tipo, nome: "", setor: "" })}
              disabled={pending}
            >
              <Plus className="size-4" /> Novo
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="Nenhum item no catálogo"
              description="Crie o primeiro item para que ele apareça nos formulários de cadastro."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  {tipo === "departamento" && <TableHead>Setor</TableHead>}
                  <TableHead className="w-24 text-right">Em uso</TableHead>
                  <TableHead className="w-56 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((it, i) => {
                  const chave = `${tipo}:${it.id}`;
                  const aberta = abertas.has(chave);
                  const idEstrutura = `estrutura-${tipo}-${it.id}`;
                  return (
                    <Fragment key={it.id}>
                      <TableRow className={cn(it.ativo ? "" : "opacity-60", aberta && "border-b-0")}>
                        <TableCell className="font-medium">
                          {it.emUso > 0 ? (
                            <button
                              type="button"
                              onClick={() => alternarLinha(chave)}
                              aria-expanded={aberta}
                              aria-controls={aberta ? idEstrutura : undefined}
                              title={aberta ? "Fechar" : tipo === "cargo" ? "Ver quem ocupa o cargo" : "Ver cargos e pessoas do departamento"}
                              className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ChevronRight
                                aria-hidden
                                className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-90")}
                              />
                              {it.nome}
                            </button>
                          ) : (
                            <span className="pl-5">{it.nome}</span>
                          )}
                          {!it.ativo && <Badge variant="outline" className="ml-2">arquivado</Badge>}
                        </TableCell>
                        {tipo === "departamento" && (
                          <TableCell className="text-muted-foreground">
                            {it.setor ? SETOR_LABELS[it.setor] : "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">{it.emUso}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon-sm" variant="ghost" aria-label="Mover para cima" disabled={pending || i === 0} onClick={() => mover(tipo, itens, i, -1)}>
                              <ArrowUp className="size-3.5" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Mover para baixo" disabled={pending || i === itens.length - 1} onClick={() => mover(tipo, itens, i, 1)}>
                              <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Editar"
                              disabled={pending}
                              onClick={() => setEdicao({ tipo, id: it.id, nome: it.nome, setor: it.setor ?? "" })}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={it.ativo ? "Arquivar" : "Reativar"}
                              disabled={pending}
                              onClick={() => alternarArquivo(tipo, it)}
                            >
                              {it.ativo ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />}
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Excluir"
                              disabled={pending || it.emUso > 0}
                              title={it.emUso > 0 ? "Em uso — arquive em vez de excluir." : undefined}
                              onClick={() => excluir(tipo, it)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {aberta && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell id={idEstrutura} colSpan={colunas} className="bg-muted/30 pt-1 pb-3 pl-8 whitespace-normal">
                            {estrutura(tipo, it)}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {lista({
        tipo: "cargo",
        itens: catalogos.cargos,
        titulo: "Cargos",
        descricao: "Lista usada nos formulários de cadastro. Cargo é rótulo — não concede acesso nenhum.",
      })}
      {lista({
        tipo: "departamento",
        itens: catalogos.departamentos,
        titulo: "Departamentos",
        descricao: "Subdivisão dentro de um setor. O setor continua sendo o eixo macro do vínculo.",
      })}

      <Dialog open={edicao !== null} onOpenChange={(v) => !v && setEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edicao?.id ? "Editar" : "Novo"} {edicao?.tipo === "cargo" ? "cargo" : "departamento"}
            </DialogTitle>
          </DialogHeader>
          {edicao && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-nome">Nome</Label>
                <Input
                  id="cat-nome"
                  value={edicao.nome}
                  onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                  autoFocus
                />
              </div>
              {edicao.tipo === "departamento" && (
                <div className="space-y-1.5">
                  <Label htmlFor="cat-setor">Setor</Label>
                  <select
                    id="cat-setor"
                    className={selectCls}
                    value={edicao.setor}
                    onChange={(e) => setEdicao({ ...edicao, setor: e.target.value as Setor | "" })}
                  >
                    <option value="">— a definir —</option>
                    {SETOR_VALUES.map((s) => (
                      <option key={s} value={s}>{SETOR_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              )}
              {edicao.id && (
                <p className="text-xs text-muted-foreground">
                  Renomear atualiza o rótulo em todas as fichas que usam este item.
                </p>
              )}
              {erro && <p className="text-sm text-destructive">{erro}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdicao(null)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !edicao?.nome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
