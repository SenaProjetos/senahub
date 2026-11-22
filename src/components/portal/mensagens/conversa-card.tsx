"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import {
  carregarConversaCliente,
  enviarMensagemCliente,
  marcarConversaLidaCliente,
  salvarAvisoPortalMensagem,
} from "@/modules/portal/mensagens/actions";
import type { ConversaDTO, MensagemDTO } from "@/modules/portal/mensagens/queries";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { MensagemItem } from "@/components/mensagens-cliente/mensagem-item";
import { EscreverMensagem } from "@/components/mensagens-cliente/escrever-mensagem";
import { useConversaAoVivo } from "./use-conversa-ao-vivo";

const BASE_DOWNLOAD = "/api/portal/mensagens/anexos";
/** Até esta distância do fim da lista conta como "lendo o fim": mensagem nova rola junto. */
const PERTO_DO_FIM_PX = 80;

type Estado = Pick<ConversaDTO, "mensagens" | "temAnteriores" | "decisoes" | "naoLidas">;

/** Mesma ordem do servidor: data, depois id. */
function vemAntes(a: MensagemDTO, b: MensagemDTO): boolean {
  return a.criadaEm < b.criadaEm || (a.criadaEm === b.criadaEm && a.id < b.id);
}

/**
 * Junta a página mais recente recém-lida com o que a tela já tinha: as anteriores já carregadas ("Ver anteriores")
 * ficam, com a marca de decisão atualizada pela lista de decisões. Sem nenhuma mensagem em comum e com mais páginas
 * no servidor, a tela recomeça da página nova (não deixa buraco no meio).
 */
function mesclar(atual: Estado, novo: ConversaDTO): Estado {
  const ids = new Set(novo.mensagens.map((m) => m.id));
  const primeira = novo.mensagens[0];
  const emComum = atual.mensagens.some((m) => ids.has(m.id));
  if (!primeira || (!emComum && novo.temAnteriores)) {
    return { mensagens: novo.mensagens, temAnteriores: novo.temAnteriores, decisoes: novo.decisoes, naoLidas: novo.naoLidas };
  }
  const decisao = new Map(novo.decisoes.map((d) => [d.mensagemId, d]));
  const antigas = atual.mensagens
    .filter((m) => !ids.has(m.id) && vemAntes(m, primeira))
    .map((m) => {
      const d = decisao.get(m.id);
      return {
        ...m,
        decisao: d ? { resumo: d.resumo, marcadaPor: d.marcadaPor, marcadaEm: m.decisao?.marcadaEm ?? "" } : null,
      };
    });
  return {
    mensagens: [...antigas, ...novo.mensagens],
    temAnteriores: antigas.length > 0 ? atual.temAnteriores : novo.temAnteriores,
    decisoes: novo.decisoes,
    naoLidas: novo.naoLidas,
  };
}

/**
 * Card "Fale com a coordenação" do portal: a conversa do projeto (as mensagens do cliente à direita), "Ver anteriores",
 * as decisões registradas pela coordenação, o campo de escrever e o aviso por e-mail. Mantém-se em dia sozinho
 * (`useConversaAoVivo`) e, com o card na tela, marca a conversa como lida até a última mensagem carregada.
 */
export function ConversaCard({
  projetoId,
  inicial,
  querEmail: querEmailInicial,
}: {
  projetoId: string;
  inicial: ConversaDTO;
  querEmail: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(() => ({
    mensagens: inicial.mensagens,
    temAnteriores: inicial.temAnteriores,
    decisoes: inicial.decisoes,
    naoLidas: inicial.naoLidas,
  }));
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [querEmail, setQuerEmail] = useState(querEmailInicial);
  const [salvandoAviso, startAviso] = useTransition();

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
      const r = await carregarConversaCliente({ projetoId });
      // Uma leitura mais nova já saiu: esta resposta chegou atrasada.
      if (n !== leitura.current) return;
      if (!r.ok) {
        console.warn("[portal] conversa não recarregou:", r.error);
        return;
      }
      setEstado((atual) => mesclar(atual, r.data));
    } catch (e) {
      console.warn("[portal] conversa não recarregou:", e);
    }
  }, [projetoId]);

  useConversaAoVivo({ projetoId, carregar });

  // Lida até a última mensagem carregada — só com o card na tela e a aba visível; uma vez por mensagem nova.
  const marcarLida = useCallback(() => {
    if (!visivel.current || document.visibilityState !== "visible") return;
    if (!ultima || marcadoAte.current === ultima.criadaEm) return;
    marcadoAte.current = ultima.criadaEm;
    void marcarConversaLidaCliente({ projetoId, ate: new Date(ultima.criadaEm) })
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
      const r = await carregarConversaCliente({ projetoId, antesDe: maisAntiga.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (lista.current) alturaAntesDeAnteriores.current = lista.current.scrollHeight;
      setEstado((atual) => {
        const ids = new Set(atual.mensagens.map((m) => m.id));
        return {
          ...atual,
          mensagens: [...r.data.mensagens.filter((m) => !ids.has(m.id)), ...atual.mensagens],
          temAnteriores: r.data.temAnteriores,
          decisoes: r.data.decisoes,
        };
      });
    } catch {
      toast.error("Não foi possível carregar as mensagens anteriores. Tente de novo.");
    } finally {
      setCarregandoAnteriores(false);
    }
  }

  async function enviar(texto: string, comAnexos: boolean): Promise<{ mensagemId: string } | { erro: string }> {
    const r = await enviarMensagemCliente({ projetoId, texto, comAnexos });
    return r.ok ? r.data : { erro: r.error };
  }

  function mudarAviso(quer: boolean) {
    const antes = querEmail;
    setQuerEmail(quer);
    startAviso(async () => {
      const r = await salvarAvisoPortalMensagem({ quer }).catch(() => null);
      if (!r || !r.ok) {
        setQuerEmail(antes);
        toast.error(r?.error ?? "Não foi possível salvar o aviso por e-mail. Tente de novo.");
        return;
      }
      toast.success(
        quer
          ? "Você vai receber um e-mail quando a coordenação escrever."
          : "E-mail desligado. As mensagens novas continuam no sino.",
      );
    });
  }

  return (
    <Card ref={raiz} id="mensagens" className="scroll-mt-20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle className="text-base">Fale com a coordenação</CardTitle>
          {estado.naoLidas > 0 && (
            <Badge>{estado.naoLidas === 1 ? "1 nova" : `${estado.naoLidas} novas`}</Badge>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={querEmail} onCheckedChange={mudarAviso} disabled={salvandoAviso} />
          Avisar por e-mail
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
        {estado.decisoes.length > 0 && (
          <CollapsibleSection
            titulo="Decisões"
            descricao="O que ficou combinado, registrado pela coordenação."
            resumo={<span className="text-xs text-muted-foreground">{estado.decisoes.length}</span>}
          >
            <ul className="space-y-2">
              {estado.decisoes.map((d) => (
                <li key={d.mensagemId} className="space-y-0.5 text-sm">
                  <p className="whitespace-pre-wrap break-words">{d.resumo ?? d.trecho}</p>
                  <p className="text-xs text-muted-foreground">
                    Mensagem de {formatarData(d.mensagemEm)} · {d.marcadaPor}
                  </p>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {estado.mensagens.length > 0 ? (
          <div
            ref={lista}
            onScroll={aoRolar}
            className="max-h-[min(32rem,60svh)] space-y-2 overflow-y-auto overscroll-contain pr-1"
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
                <MensagemItem key={m.id} m={m} meuLado="cliente" baseDownload={BASE_DOWNLOAD} />
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-sm border border-dashed px-3 py-3 text-sm text-muted-foreground">
            <MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>Nenhuma mensagem ainda. Escreva abaixo para falar com a coordenação do projeto.</p>
          </div>
        )}

        <EscreverMensagem enviar={enviar} aoTerminar={carregar} />
      </CardContent>
    </Card>
  );
}
