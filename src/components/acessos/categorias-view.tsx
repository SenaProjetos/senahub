"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { criarCategoria, editarCategoria, excluirCategoria } from "@/modules/acessos/actions";
import { iconeDaCategoria, corDaCategoria } from "@/modules/acessos/labels";
import { cn } from "@/lib/utils";

export type CategoriaAdmin = {
  id: string;
  nome: string;
  icone: string | null;
  ativo: boolean;
  /** Quantos acessos usam. Decide entre excluir e desativar. */
  emUso: number;
};

/**
 * §10/§76 — catálogo de categorias.
 *
 * O ÍCONE não é escolhido aqui: `iconeDaCategoria` casa por NOME, com expressão regular
 * ("bombeiro", "crea|conselho", "software|licen"…). Oferecer um seletor de ícone daria a
 * impressão de controle que a tela não tem — quem renomeia "CREA" para "Conselhos" continua
 * pegando o mesmo ícone, e quem cria "Cartório" cai no genérico. A prévia mostra o que vai
 * sair, que é a informação útil.
 */
export function CategoriasView({ categorias }: { categorias: CategoriaAdmin[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const confirmar = useConfirm();

  function criar() {
    if (!nova.trim()) return;
    iniciar(async () => {
      const r = await criarCategoria({ nome: nova.trim(), icone: undefined });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Categoria criada.");
      setNova("");
      router.refresh();
    });
  }

  function salvarEdicao(c: CategoriaAdmin) {
    iniciar(async () => {
      const r = await editarCategoria({
        id: c.id,
        nome: rascunho.trim(),
        icone: c.icone ?? undefined,
        ativo: c.ativo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Categoria atualizada.");
      setEditando(null);
      router.refresh();
    });
  }

  function alternarAtivo(c: CategoriaAdmin) {
    iniciar(async () => {
      const r = await editarCategoria({
        id: c.id,
        nome: c.nome,
        icone: c.icone ?? undefined,
        ativo: !c.ativo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(c.ativo ? "Categoria desativada." : "Categoria reativada.");
      router.refresh();
    });
  }

  async function pedirExclusao(c: CategoriaAdmin) {
    const ok = await confirmar({
      title: "Excluir categoria",
      description: `"${c.nome}" será removida do catálogo. Nenhum acesso a utiliza.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    iniciar(async () => {
      const r = await excluirCategoria({ id: c.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Categoria excluída.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="nova">Nova categoria</Label>
          <Input
            id="nova"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                criar();
              }
            }}
            placeholder="Cartório, Concessionária..."
          />
        </div>
        <Button onClick={criar} disabled={!nova.trim() || pendente}>
          <Plus className="size-4" aria-hidden />
          Adicionar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Categoria</TableHead>
              <TableHead>Acessos</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.map((c) => {
              const Icone = iconeDaCategoria(c.nome);
              const emEdicao = editando === c.id;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Icone className={cn("size-4", corDaCategoria(c.nome))} aria-hidden />
                  </TableCell>
                  <TableCell>
                    {emEdicao ? (
                      <Input
                        value={rascunho}
                        onChange={(e) => setRascunho(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") salvarEdicao(c);
                          if (e.key === "Escape") setEditando(null);
                        }}
                        aria-label={`Novo nome para ${c.nome}`}
                        autoFocus
                        className="h-8"
                      />
                    ) : (
                      <span className={cn(!c.ativo && "text-muted-foreground line-through")}>
                        {c.nome}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.emUso > 0 ? (
                      <Badge variant="outline" className="font-normal tabular-nums">
                        {c.emUso}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">nenhum</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={c.ativo}
                      onCheckedChange={() => alternarAtivo(c)}
                      disabled={pendente}
                      aria-label={`${c.nome} ativa`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {emEdicao ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            aria-label="Salvar"
                            disabled={pendente || !rascunho.trim()}
                            onClick={() => salvarEdicao(c)}
                          >
                            <Check className="size-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            aria-label="Cancelar edição"
                            onClick={() => setEditando(null)}
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            aria-label={`Renomear ${c.nome}`}
                            onClick={() => {
                              setEditando(c.id);
                              setRascunho(c.nome);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          {/* Excluir só aparece quando ninguém usa: com acessos vinculados a FK
                              é RESTRICT, e a saída é desativar. Oferecer o botão para depois
                              recusar seria só um erro a mais para o usuário descobrir. */}
                          {c.emUso === 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0"
                              aria-label={`Excluir ${c.nome}`}
                              onClick={() => pedirExclusao(c)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Categoria desativada não aparece no cadastro de novos acessos, mas continua visível nos
        acessos que já a utilizam. O ícone é escolhido automaticamente pelo nome.
      </p>
    </div>
  );
}
