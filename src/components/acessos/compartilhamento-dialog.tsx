"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { gerenciarCompartilhamento } from "@/modules/acessos/actions";
import { SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";
import { TIPO_ALVO_LABEL } from "@/modules/acessos/labels";
import type { OpcoesFormulario } from "@/modules/acessos/queries";

type Linha = {
  tipoAlvo: "usuario" | "perfil" | "setor";
  alvoId: string;
  podeVerCadastro: boolean;
  podeVerCredencial: boolean;
  podeEditar: boolean;
  podeGerenciarPermissoes: boolean;
};

const SETORES = Object.entries(SETOR_LABELS).map(([valor, rotulo]) => ({ valor, rotulo }));

/**
 * §29 — quem enxerga este acesso.
 *
 * Uma linha por ALVO, com as quatro permissões em colunas, em vez das duas listas separadas que
 * §29 desenha ("quem vê o cadastro" / "quem vê a credencial"). O modelo do banco é uma linha por
 * alvo com quatro flags; duas listas exigiriam fundir de volta na hora de salvar, e é aí que
 * nasce a inconsistência — alguém em uma lista e não na outra, com o merge decidindo em silêncio
 * o que fazer. As permissões continuam INDEPENDENTES, que é o que §27/§91 exigem: são checkboxes
 * separados, e marcar credencial não marca cadastro sozinho.
 *
 * O servidor normaliza de novo (`normalizarCompartilhamentos`): esta tela é conveniência, não
 * autoridade.
 */
export function CompartilhamentoDialog({
  aberto,
  onFechar,
  credencialId,
  opcoes,
  inicial,
}: {
  aberto: boolean;
  onFechar: () => void;
  credencialId: string;
  opcoes: OpcoesFormulario;
  inicial: Array<{
    tipoAlvo: string;
    alvoId: string;
    podeVerCadastro: boolean;
    podeVerCredencial: boolean;
    podeEditar: boolean;
    podeGerenciarPermissoes: boolean;
  }>;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial.map((l) => ({ ...l, tipoAlvo: l.tipoAlvo as Linha["tipoAlvo"] })),
  );
  const [novoTipo, setNovoTipo] = useState<Linha["tipoAlvo"]>("usuario");
  const [novoAlvo, setNovoAlvo] = useState("");

  const alvosDoTipo =
    novoTipo === "usuario"
      ? opcoes.pessoas.map((p) => ({ valor: p.id, rotulo: p.name }))
      : novoTipo === "perfil"
        ? opcoes.perfis.map((p) => ({ valor: p.id, rotulo: p.nome }))
        : SETORES;

  function nomeDoAlvo(l: Linha): string {
    if (l.tipoAlvo === "usuario") return opcoes.pessoas.find((p) => p.id === l.alvoId)?.name ?? "Pessoa removida";
    if (l.tipoAlvo === "perfil") return opcoes.perfis.find((p) => p.id === l.alvoId)?.nome ?? "Perfil removido";
    return SETOR_LABELS[l.alvoId as keyof typeof SETOR_LABELS] ?? l.alvoId;
  }

  function adicionar() {
    if (!novoAlvo) return;
    const jaTem = linhas.some((l) => l.tipoAlvo === novoTipo && l.alvoId === novoAlvo);
    if (jaTem) {
      toast.error("Este alvo já está na lista.");
      return;
    }
    setLinhas((v) => [
      ...v,
      {
        tipoAlvo: novoTipo,
        alvoId: novoAlvo,
        // Nasce só com o cadastro: conceder a credencial tem que ser um clique deliberado,
        // não o default de adicionar alguém à lista (§27).
        podeVerCadastro: true,
        podeVerCredencial: false,
        podeEditar: false,
        podeGerenciarPermissoes: false,
      },
    ]);
    setNovoAlvo("");
  }

  function alternar(i: number, campo: keyof Omit<Linha, "tipoAlvo" | "alvoId">) {
    setLinhas((v) => v.map((l, idx) => (idx === i ? { ...l, [campo]: !l[campo] } : l)));
  }

  function salvar() {
    iniciar(async () => {
      const r = await gerenciarCompartilhamento({ id: credencialId, compartilhamentos: linhas });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Compartilhamento atualizado.");
      onFechar();
      router.refresh();
    });
  }

  const semCredencial = linhas.length > 0 && linhas.every((l) => !l.podeVerCredencial);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quem pode acessar</DialogTitle>
          <DialogDescription>
            Ver o cadastro e ver a credencial são permissões independentes: alguém pode saber que
            a conta existe sem poder ler a senha.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Tipo</span>
            <Select
              value={novoTipo}
              onValueChange={(v) => {
                setNovoTipo((v as Linha["tipoAlvo"]) ?? "usuario");
                setNovoAlvo("");
              }}
            >
              <SelectTrigger className="h-9 w-40" aria-label="Tipo de alvo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["usuario", "perfil", "setor"] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_ALVO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex min-w-56 flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Quem</span>
            <Select value={novoAlvo} onValueChange={(v) => setNovoAlvo(v ?? "")}>
              <SelectTrigger className="h-9 w-full" aria-label="Alvo do compartilhamento">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {alvosDoTipo.map((a) => (
                  <SelectItem key={a.valor} value={a.valor}>
                    {a.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button variant="outline" onClick={adicionar} disabled={!novoAlvo}>
            <Plus className="size-4" aria-hidden />
            Adicionar
          </Button>
        </div>

        {linhas.length === 0 ? (
          <EmptyState
            icon={Info}
            title="Ninguém além dos administradores"
            description="Adicione pessoas, perfis ou setores para que este acesso apareça para eles."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium">Quem</th>
                  <th className="p-2 text-center font-medium">Ver cadastro</th>
                  <th className="p-2 text-center font-medium">Ver credencial</th>
                  <th className="p-2 text-center font-medium">Editar</th>
                  <th className="p-2 text-center font-medium">Compartilhar</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={`${l.tipoAlvo}-${l.alvoId}`} className="border-b last:border-0">
                    <td className="p-2">
                      <span className="block">{nomeDoAlvo(l)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {TIPO_ALVO_LABEL[l.tipoAlvo]}
                      </span>
                    </td>
                    {(
                      [
                        ["podeVerCadastro", "ver o cadastro"],
                        ["podeVerCredencial", "ver a credencial"],
                        ["podeEditar", "editar"],
                        ["podeGerenciarPermissoes", "compartilhar"],
                      ] as const
                    ).map(([campo, descricao]) => (
                      <td key={campo} className="p-2 text-center">
                        <Checkbox
                          checked={l[campo]}
                          onCheckedChange={() => alternar(i, campo)}
                          aria-label={`${nomeDoAlvo(l)} pode ${descricao}`}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        aria-label={`Remover ${nomeDoAlvo(l)}`}
                        onClick={() => setLinhas((v) => v.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {semCredencial && (
          <p className="flex items-start gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Ninguém desta lista pode revelar a credencial. Eles verão o cadastro, mas a senha
            continuará restrita aos administradores.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar compartilhamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
