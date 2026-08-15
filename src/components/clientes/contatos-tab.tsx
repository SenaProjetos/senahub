"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Star, X, Check, Users } from "lucide-react";
import {
  buscarContatosCliente,
  adicionarContato,
  editarContato,
} from "@/modules/clientes/actions";
import type { ContatoItem } from "@/modules/clientes/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type FormLinha = { nome: string; cargo: string; email: string; telefone: string };
const LINHA_VAZIA: FormLinha = { nome: "", cargo: "", email: "", telefone: "" };

/**
 * Aba "Contatos" do formulário de Empresa (F1.11) — edição INLINE, sem abrir outro modal.
 * Diferente de `ContatoDialog` (usado na página de detalhe do cliente, que continua existindo
 * sem mudança): aqui a lista, a edição e a criação vivem na mesma superfície.
 *
 * Carrega sob demanda por CONSTRUÇÃO: o pai só monta este componente quando a aba "Contatos" é
 * selecionada pela primeira vez (ver `cliente-form.tsx`) — editar Identificação não paga o
 * custo de buscar contatos que talvez nunca sejam vistos. Uma vez montado, o pai não desmonta
 * de novo ao trocar de aba, então a busca abaixo roda uma única vez.
 */
export function ContatosTab({ clienteId }: { clienteId: string }) {
  const [contatos, setContatos] = useState<ContatoItem[] | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [linha, setLinha] = useState<FormLinha>(LINHA_VAZIA);
  const [novo, setNovo] = useState(false);
  const [pending, startTransition] = useTransition();

  function carregar() {
    startTransition(async () => {
      const r = await buscarContatosCliente({ clienteId });
      if (r.ok) setContatos(r.data);
      else toast.error(r.error);
    });
  }

  // Busca uma vez, na montagem — o componente só é montado quando a aba é aberta pela
  // primeira vez (ver o comentário da função acima). `carregar` de propósito fora das deps:
  // incluí-la recriaria o efeito a cada render (a função não é memoizada).
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function iniciarEdicao(c: ContatoItem) {
    setNovo(false);
    setEditandoId(c.id);
    setLinha({ nome: c.nome, cargo: c.cargo ?? "", email: c.email ?? "", telefone: c.telefone ?? "" });
  }

  function iniciarNovo() {
    setEditandoId(null);
    setNovo(true);
    setLinha(LINHA_VAZIA);
  }

  function cancelar() {
    setEditandoId(null);
    setNovo(false);
    setLinha(LINHA_VAZIA);
  }

  function salvar() {
    if (linha.nome.trim().length < 2) {
      toast.error("Informe o nome do contato.");
      return;
    }
    startTransition(async () => {
      const payload = {
        nome: linha.nome,
        cargo: linha.cargo || undefined,
        email: linha.email || undefined,
        telefone: linha.telefone || undefined,
      };
      const r = novo
        ? await adicionarContato({ clienteId, ...payload })
        : await editarContato({ id: editandoId!, ...payload });
      if (r.ok) {
        toast.success(novo ? "Contato adicionado." : "Contato atualizado.");
        cancelar();
        carregar();
      } else {
        toast.error(r.error);
      }
    });
  }

  function tornarPrincipal(c: ContatoItem) {
    startTransition(async () => {
      const r = await editarContato({
        id: c.id,
        nome: c.nome,
        cargo: c.cargo ?? undefined,
        email: c.email ?? undefined,
        telefone: c.telefone ?? undefined,
        principal: true,
      });
      if (r.ok) {
        toast.success(`${c.nome} agora é o contato principal.`);
        carregar();
      } else {
        toast.error(r.error);
      }
    });
  }

  if (contatos === null) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Carregando contatos…</p>;
  }

  return (
    <div className="space-y-3">
      {contatos.length === 0 && !novo && (
        <EmptyState icon={Users} title="Nenhum contato cadastrado." />
      )}

      {contatos.length > 0 && (
        <ul className="divide-y rounded-sm border text-sm">
          {contatos.map((c) =>
            editandoId === c.id ? (
              <LinhaEdicao
                key={c.id}
                linha={linha}
                setLinha={setLinha}
                pending={pending}
                onSalvar={salvar}
                onCancelar={cancelar}
              />
            ) : (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium">{c.nome}</span>
                  {c.cargo && <span className="ml-2 text-muted-foreground">{c.cargo}</span>}
                  {c.principal && (
                    <Badge variant="outline" className="ml-2">
                      principal
                    </Badge>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.email, c.telefone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!c.principal && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Tornar ${c.nome} principal`}
                      onClick={() => tornarPrincipal(c)}
                      disabled={pending}
                    >
                      <Star className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${c.nome}`}
                    onClick={() => iniciarEdicao(c)}
                    disabled={pending}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {novo ? (
        <ul className="divide-y rounded-sm border text-sm">
          <LinhaEdicao
            linha={linha}
            setLinha={setLinha}
            pending={pending}
            onSalvar={salvar}
            onCancelar={cancelar}
          />
        </ul>
      ) : (
        <Button variant="outline" size="sm" onClick={iniciarNovo}>
          <Plus className="size-4" /> Novo contato
        </Button>
      )}
    </div>
  );
}

function LinhaEdicao({
  linha,
  setLinha,
  pending,
  onSalvar,
  onCancelar,
}: {
  linha: FormLinha;
  setLinha: (f: FormLinha) => void;
  pending: boolean;
  onSalvar: () => void;
  onCancelar: () => void;
}) {
  return (
    <li className="space-y-2 bg-muted/30 px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Nome"
          value={linha.nome}
          onChange={(e) => setLinha({ ...linha, nome: e.target.value })}
          autoFocus
        />
        <Input
          placeholder="Cargo"
          value={linha.cargo}
          onChange={(e) => setLinha({ ...linha, cargo: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="email"
          placeholder="E-mail"
          value={linha.email}
          onChange={(e) => setLinha({ ...linha, email: e.target.value })}
        />
        <Input
          placeholder="Telefone"
          value={linha.telefone}
          onChange={(e) => setLinha({ ...linha, telefone: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancelar} disabled={pending}>
          <X className="size-4" /> Cancelar
        </Button>
        <Button size="sm" onClick={onSalvar} disabled={pending}>
          <Check className="size-4" /> Salvar
        </Button>
      </div>
    </li>
  );
}
