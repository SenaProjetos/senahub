"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rotuloRevisao } from "@/lib/utils";
import {
  aplicarBloqueioOuRestricao,
  aplicarControlePasta,
  arquivarRevisao,
  devolverRevisao,
  enviarParaAnalise,
  marcarEmRevisao,
  previaDoEnvio,
  publicarRevisao,
  removerBloqueioOuRestricao,
  removerControlePasta,
} from "@/modules/uploads/ciclo/actions";
import type { CicloDaLinha, EscolhaCiclo } from "@/modules/uploads/ciclo/acoes";
import { ESCOPOS_BLOQUEIO, ROTULO_CONTROLE, ROTULO_ESCOPO, type EscopoBloqueio, type TipoControle } from "@/modules/uploads/ciclo/estados";
import {
  descricaoVemDoCarimbo,
  motivoDescricaoGenerica,
  motivoDescricaoVazia,
  PRECISA_DESCRICAO_A_PARTIR_DE,
  type DescricaoDoCarimbo,
} from "@/modules/uploads/ciclo/envio-regras";
import { CONFIRMACOES_DO_CICLO, confirmacaoDaRecusa, type ConfirmacaoDoCiclo } from "@/modules/uploads/ciclo/confirmacoes";
import { AVISO_MOTIVO_EM_REVISAO_PUBLICO, AVISO_PUBLICAR_ENVIA_AO_CLIENTE } from "@/components/projetos/arquivos/barra-selecao-documentos";

/**
 * O projeto envia ao cliente o que é publicado — o mesmo sinal que chega à barra de seleção. Vai por contexto
 * porque o diálogo é montado pelo hook de ações (e pelo painel de detalhes), longe da prop da tabela.
 */
const EnvioAoClienteDoProjeto = createContext(false);

export function EnvioAoClienteProvider({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  return <EnvioAoClienteDoProjeto.Provider value={ativo}>{children}</EnvioAoClienteDoProjeto.Provider>;
}

/** O que a linha manda abrir: a escolha do menu e o ciclo da revisão. */
export type PedidoCiclo = { escolha: EscolhaCiclo; ciclo: CicloDaLinha; nome: string };

type Config = {
  titulo: string;
  descricao: string;
  campo: { rotulo: string; obrigatorio: boolean; placeholder: string; nota?: string } | null;
  escopos?: boolean;
  botao: string;
  /** Rótulo do botão que fecha sem fazer nada (padrão "Cancelar"). */
  fechar?: string;
  destrutivo?: boolean;
};

function configDe(p: PedidoCiclo, envioAutomaticoAoCliente: boolean): Config {
  const rev = p.ciclo.numero ? rotuloRevisao(p.ciclo.numero) : "";
  const e = p.escolha;
  if (e.tipo === "transicao") {
    switch (e.acao) {
      case "enviar_analise": {
        const obrigatoria = (p.ciclo.numero ?? 1) >= PRECISA_DESCRICAO_A_PARTIR_DE;
        return {
          titulo: `Enviar ${rev} para análise`,
          // Vale para os dois modos sem precisar saber qual é: em "Nomenclatura livre" o nome não é conferido.
          descricao:
            "Antes de enviar, o sistema confere o PDF, o carimbo e se algum arquivo é igual ao da revisão anterior. O nome e os catálogos só são conferidos quando o projeto exige o padrão de nomenclatura.",
          campo: { rotulo: obrigatoria ? "O que mudou nesta revisão" : "O que mudou nesta revisão (opcional na R00)", obrigatorio: obrigatoria, placeholder: "Ex.: ajuste das cotas do pavimento tipo" },
          botao: "Enviar para análise",
        };
      }
      case "publicar":
        return {
          titulo: `Publicar ${rev}`,
          descricao: `Publicado não volta: correção vira uma nova revisão. A revisão anterior é arquivada e perde a liberação para obra.${envioAutomaticoAoCliente ? ` ${AVISO_PUBLICAR_ENVIA_AO_CLIENTE}` : ""}`,
          campo: { rotulo: "Justificativa (só se houver apontamentos em aberto e o projeto permitir publicar assim)", obrigatorio: false, placeholder: "Ex.: prazo da obra; pendências não afetam a execução" },
          botao: "Publicar",
        };
      case "devolver":
        return {
          titulo: `Devolver ${rev} para ajustes`,
          descricao: "A revisão volta para o projetista, que é avisado com o motivo.",
          campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "O que precisa ser ajustado" },
          botao: "Devolver",
        };
      case "arquivar":
        return {
          titulo: `Arquivar ${rev}`,
          descricao: "Arquivada é somente leitura e sai das pastas do cliente. Use quando o documento foi cancelado ou ficou obsoleto.",
          campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Ex.: prancha cancelada pelo cliente" },
          botao: "Arquivar",
          destrutivo: true,
        };
    }
  }
  if (e.tipo === "aplicar" && e.controle === "em_revisao") {
    return {
      titulo: `Marcar ${rev} em revisão`,
      descricao:
        "O cliente pediu ajuste. A revisão continua com o cliente e na obra até a próxima ser publicada, e os responsáveis da disciplina são avisados.",
      campo: {
        rotulo: "O que o cliente pediu",
        obrigatorio: true,
        placeholder: "Ex.: mudar a posição dos pilares do térreo",
        nota: AVISO_MOTIVO_EM_REVISAO_PUBLICO,
      },
      botao: "Marcar em revisão",
    };
  }
  if (e.tipo === "aplicar") {
    const rotulo = ROTULO_CONTROLE[e.controle];
    return {
      titulo: e.controle === "bloqueio" ? `Bloquear ${rev}` : e.controle === "restricao" ? `Aplicar restrição na ${rev}` : `${rotulo} — ${rev}`,
      descricao:
        e.controle === "bloqueio"
          ? "Enquanto bloqueada, a revisão também não muda de estado."
          : e.controle === "restricao"
            ? "Com restrição, a revisão não é liberada para obra."
            : e.controle === "liberado_obra"
              ? "A equipe de obra passa a ver esta revisão e é avisada."
              : "O cliente passa a ver esta revisão na pasta dele no link.",
      campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Fica registrado no histórico da revisão" },
      escopos: e.controle === "bloqueio",
      botao: e.controle === "bloqueio" ? "Bloquear" : e.controle === "restricao" ? "Aplicar restrição" : rotulo,
    };
  }
  const controle = p.ciclo.controles.find((c) => c.id === e.controleId);
  if (controle?.tipo === "em_revisao") {
    return {
      titulo: `Cancelar a revisão da ${rev}`,
      descricao: `O cliente tinha pedido: ${controle.motivo}`,
      campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Ex.: o cliente desistiu da mudança" },
      botao: "Cancelar revisão",
      // "Cancelar" ao lado de "Cancelar revisão" confunde: o botão que só fecha diz isso.
      fechar: "Fechar",
      destrutivo: true,
    };
  }
  return {
    titulo: `Remover "${controle ? ROTULO_CONTROLE[controle.tipo] : "controle"}" da ${rev}`,
    descricao: controle ? `Aplicado por: ${controle.motivo}` : "",
    campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Fica registrado no histórico da revisão" },
    botao: "Remover",
    destrutivo: true,
  };
}

/**
 * Prévia da descrição lida do carimbo, guardada com a revisão a que se refere (resposta atrasada não vale).
 * `falhou`: a leitura não respondeu — o envio segue com o texto digitado.
 */
type PreviaEnvio = { revisaoId: string; carimbo: DescricaoDoCarimbo | null; rotulo: string; falhou?: boolean };

function ehEnvioComDescricao(p: PedidoCiclo | null): boolean {
  return (
    p !== null &&
    p.escolha.tipo === "transicao" &&
    p.escolha.acao === "enviar_analise" &&
    (p.ciclo.numero ?? 1) >= PRECISA_DESCRICAO_A_PARTIR_DE
  );
}

/**
 * O que o carimbo disse da descrição desta revisão: o texto lido (só leitura) ou por que bloqueia, e a caixa
 * "O carimbo foi lido errado" — o projetista sempre pode contestar e digitar a descrição.
 */
function DescricaoDoCarimboNoEnvio({
  previa,
  contestar,
  onContestar,
  desabilitado,
}: {
  previa: PreviaEnvio & { carimbo: Exclude<DescricaoDoCarimbo, { tipo: "sem_quadro" }> };
  contestar: boolean;
  onContestar: (v: boolean) => void;
  desabilitado: boolean;
}) {
  const c = previa.carimbo;
  return (
    <div className="space-y-2">
      {c.tipo === "lida" ? (
        <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">O que mudou nesta revisão, lido do carimbo ({previa.rotulo})</p>
          <p className="whitespace-pre-wrap font-medium">{c.texto}</p>
        </div>
      ) : (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {c.tipo === "vazia" ? motivoDescricaoVazia(previa.rotulo) : motivoDescricaoGenerica(c.texto)}
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={contestar} disabled={desabilitado} onCheckedChange={(v) => onContestar(v === true)} />
        <span>O carimbo foi lido errado. Vou digitar o que mudou (quem analisa é avisado para conferir o PDF).</span>
      </label>
    </div>
  );
}

/** Liberação, envio ao cliente e "Em revisão" saem por `removerControlePasta`; bloqueio e restrição, pela outra. */
function ehControleDePasta(tipo: TipoControle | undefined): boolean {
  return tipo === "liberado_obra" || tipo === "enviado_cliente" || tipo === "em_revisao";
}

/** Diálogo único das ações do ciclo documental — montado uma vez por tabela. */
export function CicloAcaoDialog({ pedido, onFechar }: { pedido: PedidoCiclo | null; onFechar: () => void }) {
  const router = useRouter();
  const envioAutomaticoAoCliente = useContext(EnvioAoClienteDoProjeto);
  const [pendente, start] = useTransition();
  const [texto, setTexto] = useState("");
  const [escopos, setEscopos] = useState<EscopoBloqueio[]>(["download"]);
  const [erro, setErro] = useState<string | null>(null);
  // O servidor pediu uma confirmação explícita (carimbo ilegível, publicar sem DWG).
  const [pede, setPede] = useState<ConfirmacaoDoCiclo | null>(null);
  const [confirmou, setConfirmou] = useState(false);
  // Envio da R01 em diante: o que o carimbo diz da descrição, e se o projetista contestou a leitura.
  const [previa, setPrevia] = useState<PreviaEnvio | null>(null);
  const [contestar, setContestar] = useState(false);
  const revisaoDoEnvio = ehEnvioComDescricao(pedido) ? pedido!.ciclo.revisaoId : null;
  useEffect(() => {
    if (!revisaoDoEnvio) return;
    let vivo = true;
    // Prévia que falhou (recusa ou rede): segue com o campo digitado — o servidor relê o carimbo no envio de qualquer jeito.
    const falhou: PreviaEnvio = { revisaoId: revisaoDoEnvio, carimbo: null, rotulo: "", falhou: true };
    void previaDoEnvio({ revisaoId: revisaoDoEnvio })
      .then((r) => {
        if (!vivo) return;
        setPrevia(r.ok ? { revisaoId: revisaoDoEnvio, carimbo: r.data.carimbo, rotulo: r.data.rotulo } : falhou);
      })
      .catch(() => vivo && setPrevia(falhou));
    return () => {
      vivo = false;
    };
  }, [revisaoDoEnvio]);
  // O botão principal fica desabilitado até a confirmação: o foco do teclado vem para a caixa.
  const caixaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pede) caixaRef.current?.focus();
  }, [pede]);
  // Pedido novo zera o formulário (ajuste durante o render, sem efeito).
  const [pedidoVisto, setPedidoVisto] = useState(pedido);
  if (pedidoVisto !== pedido) {
    setPedidoVisto(pedido);
    setTexto("");
    setEscopos(["download"]);
    setErro(null);
    setPede(null);
    setConfirmou(false);
    setContestar(false);
    setPrevia(null);
  }

  const cfgBase = pedido ? configDe(pedido, envioAutomaticoAoCliente) : null;
  // R01 em diante: até a prévia chegar não há campo; com o carimbo lido, o campo só aparece contestando.
  const previaAtual = revisaoDoEnvio && previa?.revisaoId === revisaoDoEnvio ? previa : null;
  const lendoCarimbo = revisaoDoEnvio !== null && previaAtual === null;
  const doCarimbo = previaAtual?.carimbo && previaAtual.carimbo.tipo !== "sem_quadro" ? { ...previaAtual, carimbo: previaAtual.carimbo } : null;
  const carimboDecide = doCarimbo !== null && descricaoVemDoCarimbo(doCarimbo.carimbo, contestar);
  const cfg =
    cfgBase && revisaoDoEnvio && (lendoCarimbo || carimboDecide)
      ? { ...cfgBase, campo: null }
      : cfgBase;
  // Linha vazia ou genérica no carimbo bloqueia no servidor: só segue contestando.
  const carimboBloqueia = carimboDecide && doCarimbo.carimbo.tipo !== "lida";
  const faltaTexto = !!cfg?.campo?.obrigatorio && texto.trim() === "";
  const faltaEscopo = !!cfg?.escopos && escopos.length === 0;
  const faltaConfirmar = pede !== null && !confirmou;

  function executar() {
    if (!pedido || !cfg) return;
    const revisaoId = pedido.ciclo.revisaoId!;
    const valor = texto.trim();
    const e = pedido.escolha;
    start(async () => {
      const r =
        e.tipo === "transicao"
          ? e.acao === "enviar_analise"
            ? await enviarParaAnalise({
                revisaoId,
                descricao: cfg.campo ? valor || undefined : undefined,
                confirmarSemCarimbo: pede === "carimbo" && confirmou,
                contestarCarimbo: doCarimbo !== null && contestar,
              })
            : e.acao === "publicar"
              ? await publicarRevisao({ revisaoId, justificativa: valor || undefined, confirmarSemDwg: pede === "dwg" && confirmou })
              : e.acao === "devolver"
                ? await devolverRevisao({ revisaoId, motivo: valor })
                : await arquivarRevisao({ revisaoId, motivo: valor })
          : e.tipo === "aplicar"
            ? e.controle === "liberado_obra" || e.controle === "enviado_cliente"
              ? await aplicarControlePasta({ revisaoId, tipo: e.controle, motivo: valor })
              : e.controle === "em_revisao"
                ? await marcarEmRevisao({ revisaoId, motivo: valor })
                : await aplicarBloqueioOuRestricao({ revisaoId, tipo: e.controle, motivo: valor, escopos: e.controle === "bloqueio" ? escopos : undefined })
            : ehControleDePasta(pedido.ciclo.controles.find((c) => c.id === e.controleId)?.tipo)
              ? await removerControlePasta({ controleId: e.controleId, motivo: valor })
              : await removerBloqueioOuRestricao({ controleId: e.controleId, motivo: valor });
      if (!r.ok) {
        const confirmacao = confirmacaoDaRecusa(r.error);
        if (confirmacao) {
          setPede(confirmacao);
          setErro(null);
          return;
        }
        setErro(r.error);
        return;
      }
      const enviadaAoCliente =
        typeof r.data === "object" && r.data !== null && "envioAoCliente" in r.data && r.data.envioAoCliente === "automatico";
      toast.success(enviadaAoCliente ? "Publicada e enviada ao cliente." : "Feito.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={pedido !== null} onOpenChange={(aberto) => !aberto && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {cfg && pedido && (
          <>
            <DialogHeader>
              <DialogTitle>{cfg.titulo}</DialogTitle>
              <DialogDescription>
                <span className="block truncate font-medium text-foreground/80" title={pedido.nome}>{pedido.nome}</span>
                {cfg.descricao}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {lendoCarimbo && (
                <p role="status" className="text-sm text-muted-foreground">Lendo a descrição no carimbo do PDF…</p>
              )}
              {previaAtual?.falhou && (
                <p className="text-xs text-muted-foreground">Não foi possível ler o carimbo agora. Descreva o que mudou nesta revisão.</p>
              )}
              {doCarimbo && (
                <DescricaoDoCarimboNoEnvio previa={doCarimbo} contestar={contestar} onContestar={setContestar} desabilitado={pendente} />
              )}
              {cfg.campo && (
                <div className="space-y-1.5">
                  <Label htmlFor="ciclo-texto">{cfg.campo.rotulo}</Label>
                  <textarea
                    id="ciclo-texto"
                    value={texto}
                    maxLength={1000}
                    disabled={pendente}
                    onChange={(ev) => setTexto(ev.target.value)}
                    placeholder={cfg.campo.placeholder}
                    className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {cfg.campo.nota && <p className="text-xs text-muted-foreground">{cfg.campo.nota}</p>}
                </div>
              )}
              {cfg.escopos && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">O que fica bloqueado</legend>
                  {ESCOPOS_BLOQUEIO.map((escopo) => (
                    <label key={escopo} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={escopos.includes(escopo)}
                        disabled={pendente}
                        onCheckedChange={(v) => setEscopos((atual) => (v ? [...atual, escopo] : atual.filter((x) => x !== escopo)))}
                      />
                      {ROTULO_ESCOPO[escopo][0].toUpperCase() + ROTULO_ESCOPO[escopo].slice(1)}
                    </label>
                  ))}
                </fieldset>
              )}
              {pede && (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  <p role="alert">{CONFIRMACOES_DO_CICLO[pede].motivo}</p>
                  <label className="flex items-start gap-2">
                    <Checkbox ref={caixaRef} checked={confirmou} disabled={pendente} onCheckedChange={(v) => setConfirmou(v === true)} />
                    <span>{CONFIRMACOES_DO_CICLO[pede].caixa(1)}</span>
                  </label>
                </div>
              )}
              {erro && (
                <p role="alert" className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onFechar} disabled={pendente}>{cfg.fechar ?? "Cancelar"}</Button>
              <Button variant={cfg.destrutivo ? "destructive" : "default"} onClick={executar} disabled={pendente || faltaTexto || faltaEscopo || faltaConfirmar || lendoCarimbo || carimboBloqueia}>
                {pendente ? "Aguarde…" : cfg.botao}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
