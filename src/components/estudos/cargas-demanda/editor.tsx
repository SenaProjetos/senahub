"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { limparSeparadores, type AcaoItemAcao } from "@/components/ui/acoes";
import { formatarDataHora } from "@/lib/utils";
import { AVISO_EM_VALIDACAO, MOTIVO_ALTERADO_POR_OUTRA_PESSOA, MOTIVO_SEM_EDICAO } from "@/modules/estudos/acesso";
import { ACAO_ESTUDO_DUPLICAR, ACAO_ESTUDO_EXCLUIR, hrefDoEstudo, itensDeEstudo } from "@/modules/estudos/acoes";
import { duplicarEstudoAction, excluirEstudoAction, salvarEstudoAction } from "@/modules/estudos/actions";
import type { ConteudoCargasDemanda } from "@/modules/estudos/cargas-demanda/conteudo";
import { conteudoVazio } from "@/modules/estudos/cargas-demanda/conteudo";
import { validarConteudoDoTipo } from "@/modules/estudos/tipos";
import { EtapaCentros } from "./etapa-centros";
import { EtapaDemandas } from "./etapa-demandas";
import { EtapaLevantamento } from "./etapa-levantamento";
import { CartaoDoEstudo } from "./estudo-card";
import type { Etapa } from "./tipos";

type Alteracao = { id: string; quando: Date; quem: string; oQue: string };

type Props = {
  projetoId: string;
  estudo: { id: string; nome: string; versao: number; atualizadoPor: string; atualizadoEm: Date };
  conteudoInicial: ConteudoCargasDemanda | null;
  podeEditar: boolean;
  emValidacao: boolean;
  totalEstudos: number;
  alteracoes: Alteracao[];
};

/** Estado de edição: o documento inteiro mais o nome do estudo. */
type Estado = { nome: string; conteudo: ConteudoCargasDemanda };

const assinatura = (e: Estado) => JSON.stringify([e.nome, e.conteudo]);

export function EstudoCargasDemandaEditor({ projetoId, estudo, conteudoInicial, podeEditar, emValidacao, totalEstudos, alteracoes }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [estado, setEstado] = useState<Estado>(() => ({ nome: estudo.nome, conteudo: conteudoInicial ?? conteudoVazio() }));
  const [versao, setVersao] = useState(estudo.versao);
  const [salvo, setSalvo] = useState(() => assinatura({ nome: estudo.nome, conteudo: conteudoInicial ?? conteudoVazio() }));
  const [conflito, setConflito] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [pendente, startTransition] = useTransition();

  const { conteudo } = estado;
  const alterado = useMemo(() => assinatura(estado) !== salvo, [estado, salvo]);
  const validacao = useMemo(() => validarConteudoDoTipo("cargas_demanda", conteudo), [conteudo]);
  const erro = estado.nome.trim() === "" ? "Dê um nome ao estudo." : validacao.ok ? undefined : validacao.mensagem;

  /** Toda edição do documento passa por aqui (função pura sobre o conteúdo). */
  const atualizar = (f: (c: ConteudoCargasDemanda) => ConteudoCargasDemanda) => setEstado((s) => ({ ...s, conteudo: f(s.conteudo) }));

  const salvarRef = useRef<() => Promise<void>>(async () => {});

  async function salvar() {
    if (!podeEditar || pendente || !alterado || conflito) return;
    if (erro) return void toast.error(erro);
    if (conteudoInicial === null && versao === estudo.versao) {
      const ok = await confirm({
        title: "Substituir o conteúdo ilegível?",
        description: "O conteúdo gravado deste estudo não pôde ser lido. Salvar grava o que está na tela por cima dele (o conteúdo antigo continua na auditoria).",
        confirmLabel: "Substituir e salvar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    const assin = assinatura(estado);
    startTransition(async () => {
      const r = await salvarEstudoAction({ id: estudo.id, versao, nome: estado.nome.trim(), conteudo });
      if (!r.ok) {
        if (r.error === MOTIVO_ALTERADO_POR_OUTRA_PESSOA) setConflito(true);
        toast.error(r.error);
        return;
      }
      setVersao(r.data.versao);
      setSalvo(assin);
      setConflito(false);
      toast.success("Estudo salvo.");
      router.refresh();
    });
  }
  salvarRef.current = salvar;

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void salvarRef.current();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  async function voltar() {
    if (alterado) {
      const ok = await confirm({
        title: "Sair sem salvar?",
        description: "Há alterações que ainda não foram salvas neste estudo.",
        confirmLabel: "Sair sem salvar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    router.push(`/projetos/${projetoId}/estudos`);
  }

  // ── Ações do estudo (⋯ do cabeçalho) ──────────────────────────────────────────────────────────
  const itensEstudo = limparSeparadores(
    itensDeEstudo({ projetoId, estudoId: estudo.id, podeEditar, totalEstudos, alterado, tipo: "cargas_demanda" }).filter((i) => i.id !== "abrir-estudo"),
  );

  async function executarEstudo(item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      if (item.id === ACAO_ESTUDO_DUPLICAR) {
        if (alterado) return void toast.error("Salve as alterações antes de duplicar: a cópia sai da última versão salva.");
        const r = await duplicarEstudoAction({ id: estudo.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Estudo duplicado.");
        router.push(hrefDoEstudo(projetoId, r.data.id));
      } else if (item.id === ACAO_ESTUDO_EXCLUIR) {
        const r = await excluirEstudoAction({ id: estudo.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Estudo excluído.");
        setSalvo(assinatura(estado)); // já excluído: o aviso de "não salvo" não faz mais sentido
        router.push(`/projetos/${projetoId}/estudos`);
      }
    });
  }

  const feita: Record<Etapa, boolean> = {
    1: conteudo.levantamentos.length > 0,
    2: conteudo.calculos.length > 0,
    3: conteudo.centros.cmds.length > 0,
  };
  const ETAPAS: { n: Etapa; rotulo: string }[] = [
    { n: 1, rotulo: "Levantamento" },
    { n: 2, rotulo: "Demandas" },
    { n: 3, rotulo: "Centros e entradas" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => void voltar()}>
          <ArrowLeft aria-hidden className="mr-1.5 size-4" /> Estudos
        </Button>
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Nome do estudo"
            value={estado.nome}
            maxLength={120}
            disabled={!podeEditar}
            onChange={(e) => setEstado((s) => ({ ...s, nome: e.target.value }))}
            className="text-base font-semibold"
          />
        </div>
        {!podeEditar && <Badge variant="outline">Somente leitura</Badge>}
        {podeEditar && alterado && <Badge variant="outline" className="border-warning/40 text-warning-text">Alterações não salvas</Badge>}
        {podeEditar && (
          <Button type="button" onClick={() => void salvar()} disabled={!alterado || pendente || !!erro || conflito} title="Salvar (Ctrl+S)" aria-describedby={erro ? "cd-erro" : undefined}>
            {pendente ? <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin" /> : <Save aria-hidden className="mr-1.5 size-4" />}
            Salvar
          </Button>
        )}
        <BotaoAcoes itens={itensEstudo} onSelect={(item) => void executarEstudo(item)} rotulo={`Ações do estudo ${estado.nome}`} className="size-8" />
      </div>

      <p className="text-xs text-muted-foreground">
        Estudo preliminar de demanda, sem planta de pontos · Alterado por {estudo.atualizadoPor} em {formatarDataHora(estudo.atualizadoEm)} · versão {versao}
        {!podeEditar && ` · ${MOTIVO_SEM_EDICAO}`}
      </p>
      {erro && podeEditar && (
        <p id="cd-erro" role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}

      {emValidacao && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 p-3 text-sm text-warning-text">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Motor em validação.</strong> {AVISO_EM_VALIDACAO} Só quem gere as ferramentas vê esta aba por enquanto.
          </span>
        </p>
      )}
      {conteudoInicial === null && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          O conteúdo gravado deste estudo não pôde ser lido e abriu vazio. Se você salvar, o conteúdo antigo será substituído (ele continua na auditoria).
        </p>
      )}
      {conflito && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{MOTIVO_ALTERADO_POR_OUTRA_PESSOA}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      )}

      <CartaoDoEstudo conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} />

      <nav aria-label="Etapas do estudo" className="flex flex-wrap items-center gap-2">
        {ETAPAS.map((e) => (
          <button
            key={e.n}
            type="button"
            aria-current={etapa === e.n ? "step" : undefined}
            onClick={() => setEtapa(e.n)}
            className="flex items-center gap-2 rounded-full border bg-card py-1.5 pl-2 pr-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=step]:border-primary aria-[current=step]:bg-primary aria-[current=step]:text-primary-foreground"
          >
            <span aria-hidden className="grid size-6 place-items-center rounded-full bg-muted text-xs text-foreground">
              {etapa !== e.n && feita[e.n] ? <Check className="size-3.5" /> : e.n}
            </span>
            {e.rotulo}
          </button>
        ))}
      </nav>

      {etapa === 1 && <EtapaLevantamento conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} onContinuar={() => setEtapa(2)} />}
      {etapa === 2 && <EtapaDemandas conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} onContinuar={() => setEtapa(3)} />}
      {etapa === 3 && <EtapaCentros conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} onCompletarCalculo={() => setEtapa(2)} />}

      <CollapsibleSection titulo="Alterações" descricao="Quem salvou este estudo e quando (últimas 20)." resumo={<span className="text-xs text-muted-foreground">{alteracoes.length}</span>}>
        {alteracoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {alteracoes.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{a.quem}</span>
                <span>{a.oQue}</span>
                <span className="text-muted-foreground">{formatarDataHora(a.quando)}</span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
