"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { editarCadastroDisciplina, iconeSvgDaDisciplina } from "@/modules/projetos/actions";
import { editarNomeSubdisciplina } from "@/modules/projetos/subdisciplinas/actions";
import { editarNomeItemListaMestre } from "@/modules/projetos/pranchas/catalogo-actions";
import type { AlvoCatalogo } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { EditarCardDialog, EditarNomeDialog, type PayloadCadastroCard } from "./editar-cadastro-dialog";

/** O que o lápis do card precisa e a tabela da versão não traz. */
export type CadastroCard = {
  codigo: string | null;
  categoria: string | null;
  icone: string | null;
  /** O SVG em si só é lido quando o lápis abre (`iconeSvgDaDisciplina`): a lista não o carrega. */
  temIconeSvg: boolean;
  numeracao: number | null;
  numeracaoFim: number | null;
  uso: number;
  versaoDesde: number;
  versaoAte: number | null;
};

type Aberto = { nome: string; alvo: AlvoCatalogo; iconeSvg: string | null };

/**
 * O lápis do catálogo (spec 2026-09-30, E9), igual nas duas lentes: card edita o cadastro inteiro que
 * não depende de versão; sub, fase e tipo, só o nome. Entrega `abrir` e o `dialogo` para a tela
 * renderizar. O SVG do ícone do card vem só ao abrir (a lista não o carrega).
 *
 * A leitura do SVG é assíncrona e o menu das outras linhas segue clicável enquanto ela não volta:
 * `cancelar()` (chamado a cada escolha de ação) e `outroDialogoAberto` descartam a resposta atrasada,
 * que senão trocaria o diálogo da tela pelo lápis.
 */
export function useLapis({
  cadastro,
  categorias,
  versoes,
  outroDialogoAberto,
}: {
  cadastro: Record<string, CadastroCard>;
  categorias: string[];
  versoes: readonly { numero: number; sequenciaPor: string }[];
  outroDialogoAberto: boolean;
}): { abrir: (alvo: AlvoCatalogo, nome: string) => void; cancelar: () => void; dialogo: ReactNode; ocupado: boolean } {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const pedidoAtual = useRef(0);
  const outroAberto = useRef(outroDialogoAberto);
  outroAberto.current = outroDialogoAberto;

  function abrir(alvo: AlvoCatalogo, nome: string) {
    const pedido = ++pedidoAtual.current;
    const c = alvo.tipo === "disciplina" ? cadastro[alvo.id] : undefined;
    if (!c?.temIconeSvg) {
      setAberto({ nome, alvo, iconeSvg: null });
      return;
    }
    start(async () => {
      const r = await iconeSvgDaDisciplina({ id: alvo.id });
      if (pedido !== pedidoAtual.current || outroAberto.current) return;
      if (r.ok) setAberto({ nome, alvo, iconeSvg: r.data.iconeSvg });
      else toast.error(r.error);
    });
  }

  function gravar(chamada: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) {
    start(async () => {
      const r = await chamada();
      if (r.ok) {
        toast.success("Cadastro atualizado.");
        setAberto(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const card = aberto?.alvo.tipo === "disciplina" ? cadastro[aberto.alvo.id] : undefined;
  const dialogo: ReactNode = !aberto ? null : card ? (
    <EditarCardDialog
      card={{ id: aberto.alvo.id, nome: aberto.nome, ...card, iconeSvg: aberto.iconeSvg }}
      categorias={categorias}
      versoes={versoes}
      pending={pending}
      onFechar={() => setAberto(null)}
      onSalvar={(p: PayloadCadastroCard) => gravar(() => editarCadastroDisciplina(p))}
    />
  ) : aberto.alvo.tipo !== "disciplina" ? (
    <EditarNomeDialog
      titulo={`Editar cadastro — ${aberto.nome}`}
      nome={aberto.nome}
      pending={pending}
      onFechar={() => setAberto(null)}
      onSalvar={(nome) =>
        gravar(() =>
          aberto.alvo.tipo === "subdisciplina"
            ? editarNomeSubdisciplina({ id: aberto.alvo.id, nome })
            : editarNomeItemListaMestre({ id: aberto.alvo.id, nome }),
        )
      }
    />
  ) : null;

  return { abrir, cancelar: () => void ++pedidoAtual.current, dialogo, ocupado: pending };
}
