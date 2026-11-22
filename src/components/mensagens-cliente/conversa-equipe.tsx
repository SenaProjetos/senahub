"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bookmark, MessagesSquare } from "lucide-react";
import {
  carregarConversaEquipe,
  desmarcarDecisaoDoCliente,
  enviarMensagemEquipe,
  marcarConversaLidaEquipe,
} from "@/modules/portal/mensagens/actions";
import { ACAO_MARCAR_DECISAO, ACAO_REMOVER_DECISAO, itensDaMensagem } from "@/modules/portal/mensagens/acoes";
import { estadoInicial, juntarAnteriores, mesclarConversa, type EstadoConversa } from "@/modules/portal/mensagens/mesclar";
import type { ConversaDTO, MensagemDTO } from "@/modules/portal/mensagens/queries";
import { formatarData } from "@/lib/utils";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MensagemItem } from "./mensagem-item";
import { EscreverMensagem } from "./escrever-mensagem";
import { MarcarDecisaoDialog } from "./marcar-decisao-dialog";
import { useConversaAoVivo } from "./use-conversa-ao-vivo";

const BASE_DOWNLOAD = "/api/portal/mensagens/anexos";
/** Até esta distância do fim da lista conta como "lendo o fim": mensagem nova rola junto. */
const PERTO_DO_FIM_PX = 80;

/**
 * Aba Cliente do projeto: a conversa do cliente do portal com a coordenação, do lado do escritório (as mensagens da
 * equipe à direita), e as Decisões ao lado (abaixo no celular). Mesma recarga, leitura e "ao vivo" do card do portal
 * (`mesclar.ts`, `useConversaAoVivo`). A página só chega aqui para quem é audiência da conversa: todo mundo que vê
 * pode marcar decisão (o serviço confere de novo). O menu da mensagem é só o `...` (uma ação por vez, ADR-0002 regra 4).
 */
export function ConversaEquipe({ projetoId, inicial }: { projetoId: string; inicial: ConversaDTO }) {
  const confirm = useConfirm();
  const [estado, setEstado] = useState<EstadoConversa>(() => estadoInicial(inicial));
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [marcando, setMarcando] = useState<MensagemDTO | null>(null);
  const [, startRemover] = useTransition();

  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const pertoDoFim = useRef(true);
  const alturaAntesDeAnteriores = useRef<number | null>(null);
  const visivel = useRef(false);
  const marcadoAte = useRef<string | null>(null);
  const leitura = useRef(0);

  const ultima = estado.mensagens.at(-1) ?? null;

  const carregar = useCallback(async () => {
    const n = ++leitura.current;
    try {
      const r = await carregarConversaEquipe({ projetoId });
      // Uma leitura mais nova já saiu: esta resposta chegou atrasada.
      if (n !== leitura.current) return;
      if (!r.ok) {
        console.warn("[projeto] conversa do cliente não recarregou:", r.error);
        return;
      }
      setEstado((atual) => mesclarConversa(atual, r.data));
    } catch (e) {
      console.warn("[projeto] conversa do cliente não recarregou:", e);
    }
  }, [projetoId]);

  useConversaAoVivo({ projetoId, carregar });

  // Lida até a última mensagem carregada — só com a conversa na tela e a aba visível; uma vez por mensagem nova.
  const marcarLida = useCallback(() => {
    if (!visivel.current || document.visibilityState !== "visible") return;
    if (!ultima || marcadoAte.current === ultima.criadaEm) return;
    marcadoAte.current = ultima.criadaEm;
    void marcarConversaLidaEquipe({ projetoId, ate: new Date(ultima.criadaEm) })
      .then((r) => {
        if (r.ok) setEstado((e) => ({ ...e, naoLidas: 0 }));
        else marcadoAte.current = null;
      })
      .catch(() => {
        marcadoAte.current = null;
      });
  }, [projetoId, ultima]);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entrada]) => {
        visivel.current = entrada?.isIntersecting ?? false;
        marcarLida();
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    const aoVoltarParaAba = () => marcarLida();
    document.addEventListener("visibilitychange", aoVoltarParaAba);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", aoVoltarParaAba);
    };
  }, [marcarLida]);

  // Rolagem: ao abrir, o fim; mensagem nova rola junto se a pessoa já estava no fim (ou se é dela);
  // "Ver anteriores" mantém o lugar de quem lê.
  const ultimaId = ultima?.id ?? null;
  const ultimaMinha = ultima?.minha ?? false;
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    if (alturaAntesDeAnteriores.current !== null) {
      el.scrollTop += el.scrollHeight - alturaAntesDeAnteriores.current;
      alturaAntesDeAnteriores.current = null;
      return;
    }
    if (pertoDoFim.current || ultimaMinha) el.scrollTop = el.scrollHeight;
  }, [ultimaId, ultimaMinha, estado.mensagens.length]);

  function aoRolar() {
    const el = lista.current;
    if (el) pertoDoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight <= PERTO_DO_FIM_PX;
  }

  async function verAnteriores() {
    const maisAntiga = estado.mensagens[0];
    if (!maisAntiga) return;
    setCarregandoAnteriores(true);
    try {
      const r = await carregarConversaEquipe({ projetoId, antesDe: maisAntiga.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (lista.current) alturaAntesDeAnteriores.current = lista.current.scrollHeight;
      setEstado((atual) => juntarAnteriores(atual, r.data));
    } catch {
      toast.error("Não foi possível carregar as mensagens anteriores. Tente de novo.");
    } finally {
      setCarregandoAnteriores(false);
    }
  }

  async function enviar(texto: string, comAnexos: boolean): Promise<{ mensagemId: string } | { erro: string }> {
    const r = await enviarMensagemEquipe({ projetoId, texto, comAnexos });
    return r.ok ? r.data : { erro: r.error };
  }

  async function aoEscolher(m: MensagemDTO, item: AcaoItemAcao) {
    if (item.id === ACAO_MARCAR_DECISAO) {
      setMarcando(m);
      return;
    }
    if (item.id !== ACAO_REMOVER_DECISAO) return;
    // Confirmar ANTES da transição (ADR-0002, regra 4).
    const ok = await confirm({
      title: item.confirmar?.titulo ?? "Remover a marca de decisão?",
      description: item.confirmar?.descricao,
      confirmLabel: item.confirmar?.rotuloConfirmar ?? "Remover marca",
      variant: "destructive",
    });
    if (!ok) return;
    startRemover(async () => {
      const r = await desmarcarDecisaoDoCliente({ mensagemId: m.id }).catch(() => null);
      if (!r || !r.ok) {
        toast.error(r?.error ?? "Não foi possível remover a marca. Tente de novo.");
        return;
      }
      toast.success("Marca de decisão removida.");
      await carregar();
    });
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
      <Card ref={raiz} className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-2">
          <CardTitle className="text-base">Conversa com o cliente</CardTitle>
          {estado.naoLidas > 0 && <Badge>{estado.naoLidas === 1 ? "1 nova" : `${estado.naoLidas} novas`}</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {estado.mensagens.length > 0 ? (
            <div
              ref={lista}
              onScroll={aoRolar}
              className="max-h-[min(36rem,60svh)] space-y-2 overflow-y-auto overscroll-contain pr-1"
            >
              {estado.temAnteriores && (
                <div className="flex justify-center">
                  <Button size="sm" variant="ghost" onClick={() => void verAnteriores()} disabled={carregandoAnteriores}>
                    {carregandoAnteriores ? "Carregando…" : "Ver anteriores"}
                  </Button>
                </div>
              )}
              <ol className="space-y-2" aria-label="Mensagens da conversa">
                {estado.mensagens.map((m) => (
                  <MensagemItem
                    key={m.id}
                    m={m}
                    meuLado="equipe"
                    baseDownload={BASE_DOWNLOAD}
                    acoes={
                      <BotaoAcoes
                        itens={itensDaMensagem(m, { podeDecidir: true })}
                        onSelect={(item) => void aoEscolher(m, item)}
                        rotulo={`Ações da mensagem de ${m.autorNome}`}
                      />
                    }
                  />
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-sm border border-dashed px-3 py-3 text-sm text-muted-foreground">
              <MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>Nenhuma mensagem ainda. O que você escrever aqui aparece para o cliente no portal do projeto.</p>
            </div>
          )}

          <EscreverMensagem enviar={enviar} aoTerminar={carregar} placeholder="Escreva para o cliente…" />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Decisões</CardTitle>
          <CardDescription>O que ficou combinado com o cliente. Ele vê esta lista, sem o nome de quem marcou.</CardDescription>
        </CardHeader>
        <CardContent>
          {estado.decisoes.length > 0 ? (
            <ul className="space-y-3">
              {estado.decisoes.map((d) => (
                <li key={d.mensagemId} className="flex min-w-0 gap-2 text-sm">
                  <Bookmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 space-y-0.5">
                    <p className="whitespace-pre-wrap break-words">{d.resumo ?? d.trecho}</p>
                    <p className="text-xs text-muted-foreground">
                      Mensagem de {formatarData(d.mensagemEm)} · marcada por {d.marcadaPor}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma decisão marcada. Use o ⋯ de uma mensagem para marcar o que o cliente decidiu.
            </p>
          )}
        </CardContent>
      </Card>

      <MarcarDecisaoDialog key={marcando?.id ?? "nenhuma"} mensagem={marcando} onFechar={() => setMarcando(null)} aoMarcar={carregar} />
    </div>
  );
}
