"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Paperclip, Send, X } from "lucide-react";
import {
  ANEXOS_MAX,
  MOTIVO_ANEXOS_MAX,
  MOTIVO_TEXTO_LONGO,
  TEXTO_MAX,
  TEXTO_MAX_ROTULO,
  motivoDoTipoDoAnexo,
} from "@/modules/portal/mensagens/regras";
import { EXTENSOES_ANEXO, TAMANHO_MAX_ANEXO, TAMANHO_MAX_ANEXO_LABEL } from "@/modules/portal/pedido-revisao/regras";
import { formatarBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A partir daqui o contador de caracteres aparece. */
const AVISO_TAMANHO = TEXTO_MAX - 500;
/** Os limites dos anexos, ditos na tela (e lidos pelo leitor de tela no botão Anexar). */
const LIMITES_ANEXO = `Até ${ANEXOS_MAX} arquivos de até ${TAMANHO_MAX_ANEXO_LABEL} cada: PDF, imagem (PNG ou JPG), DWG ou DXF.`;

/**
 * Tela de toque (celular, tablet): Enter quebra a linha e só o botão Enviar manda — a mensagem não se apaga nem se
 * edita, então um Enter sem querer no teclado virtual pesaria. Começa em `false` (o servidor não sabe) e se acerta
 * depois de montar.
 */
function useToque(): boolean {
  const [toque, setToque] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const atualizar = () => setToque(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);
  return toque;
}

/** Rota de anexo da conversa (a mesma para os dois lados; o servidor confere quem é o autor). */
function urlDoAnexoPadrao(mensagemId: string): string {
  return `/api/portal/mensagens/${encodeURIComponent(mensagemId)}/anexos`;
}

/**
 * Sobe os anexos de uma mensagem JÁ criada, um por requisição e em sequência. Devolve as falhas ("nome: motivo"):
 * a mensagem fica de pé mesmo que um anexo não suba.
 */
async function enviarAnexos(url: string, arquivos: readonly File[], aoProgredir: (n: number) => void): Promise<string[]> {
  const falhas: string[] = [];
  for (const [i, arquivo] of arquivos.entries()) {
    aoProgredir(i + 1);
    try {
      const fd = new FormData();
      fd.append("file", arquivo);
      const res = await fetch(url, { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        // 413 da borda (Cloudflare) não traz JSON: diz o limite em vez de "falha no envio".
        const padrao = res.status === 413 ? `Arquivo acima de ${TAMANHO_MAX_ANEXO_LABEL}.` : "Falha no envio.";
        falhas.push(`${arquivo.name}: ${data.error ?? padrao}`);
      }
    } catch {
      falhas.push(`${arquivo.name}: Falha de conexão.`);
    }
  }
  return falhas;
}

/**
 * Campo de escrever da conversa do cliente com a coordenação — o mesmo no portal e na aba Cliente. No computador,
 * Enter envia e Shift+Enter quebra a linha; em tela de toque, Enter quebra a linha e só o botão envia. A ação vem por
 * prop (`enviar`); os anexos sobem depois de a mensagem existir (`comAnexos`), um por requisição, e cada falha vira um
 * aviso. Ao fim, `aoTerminar` (recarregar a conversa) e o foco volta ao campo.
 */
export function EscreverMensagem({
  enviar,
  aoTerminar,
  urlDoAnexo = urlDoAnexoPadrao,
  placeholder = "Escreva sua mensagem…",
}: {
  enviar: (texto: string, comAnexos: boolean) => Promise<{ mensagemId: string } | { erro: string }>;
  aoTerminar: () => void | Promise<void>;
  urlDoAnexo?: (mensagemId: string) => string;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);
  const refArquivo = useRef<HTMLInputElement>(null);
  const refTexto = useRef<HTMLTextAreaElement>(null);
  const idTexto = useId();
  const idAjuda = useId();
  const idArquivo = useId();
  const idLimites = useId();
  const toque = useToque();

  const tamanho = texto.trim().length;
  const longo = tamanho > TEXTO_MAX;
  const podeEnviar = !enviando && !longo && (tamanho > 0 || arquivos.length > 0);

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novos = [...arquivos];
    for (const f of Array.from(lista)) {
      const motivo =
        (novos.length >= ANEXOS_MAX ? MOTIVO_ANEXOS_MAX : null) ??
        motivoDoTipoDoAnexo(f.name) ??
        (f.size > TAMANHO_MAX_ANEXO ? `Arquivo acima de ${TAMANHO_MAX_ANEXO_LABEL}.` : null);
      if (motivo) toast.error(`${f.name}: ${motivo}`);
      else novos.push(f);
    }
    setArquivos(novos);
    if (refArquivo.current) refArquivo.current.value = "";
  }

  async function mandar() {
    if (!podeEnviar) return;
    setEnviando(true);
    try {
      const anexos = arquivos;
      const r = await enviar(texto, anexos.length > 0);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      // A mensagem existe: o campo se limpa já, e os anexos sobem atrás dela.
      setTexto("");
      setArquivos([]);
      if (anexos.length > 0) {
        setProgresso({ atual: 0, total: anexos.length });
        const falhas = await enviarAnexos(urlDoAnexo(r.mensagemId), anexos, (atual) =>
          setProgresso({ atual, total: anexos.length }),
        );
        for (const f of falhas) toast.error(`Anexo não enviado — ${f}`);
      }
      await aoTerminar();
    } catch {
      toast.error("Não foi possível enviar a mensagem. Tente de novo.");
    } finally {
      setProgresso(null);
      setEnviando(false);
      // O foco volta ao campo para a próxima mensagem (o botão Enviar fica desabilitado com o campo vazio).
      refTexto.current?.focus();
    }
  }

  function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    void mandar();
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // Toque: Enter é quebra de linha (lido na hora, não só do estado: vale até antes de o efeito acertar `toque`).
    if (window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    void mandar();
  }

  const situacao = progresso
    ? `Enviando anexo ${Math.max(progresso.atual, 1)} de ${progresso.total}…`
    : enviando
      ? "Enviando…"
      : "";

  return (
    <form onSubmit={aoSubmeter} className="space-y-2">
      <label htmlFor={idTexto} className="sr-only">
        Mensagem
      </label>
      <textarea
        ref={refTexto}
        id={idTexto}
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={aoTeclar}
        placeholder={placeholder}
        aria-describedby={idAjuda}
        aria-invalid={longo || undefined}
        // readOnly (não disabled) enquanto envia: o foco fica no campo para a próxima mensagem.
        readOnly={enviando}
        className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive read-only:opacity-60"
      />
      {arquivos.length > 0 && (
        <ul className="space-y-1">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex min-w-0 items-center gap-2 rounded-sm border px-2 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatarBytes(f.size)}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Remover o anexo ${f.name}`}
                disabled={enviando}
                onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p id={idLimites} className="text-xs text-muted-foreground">
        {arquivos.length > 0 ? `${arquivos.length} de ${ANEXOS_MAX} anexos. ` : ""}
        {LIMITES_ANEXO}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={idAjuda} className="min-w-0 text-xs text-muted-foreground">
          {longo ? (
            <span className="text-destructive">
              {MOTIVO_TEXTO_LONGO} ({tamanho.toLocaleString("pt-BR")})
            </span>
          ) : tamanho > AVISO_TAMANHO ? (
            `${tamanho.toLocaleString("pt-BR")} de ${TEXTO_MAX_ROTULO} caracteres.`
          ) : toque ? (
            "Toque em Enviar para mandar; Enter quebra a linha."
          ) : (
            "Enter envia; Shift+Enter quebra a linha."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={refArquivo}
            id={idArquivo}
            type="file"
            multiple
            accept={EXTENSOES_ANEXO.map((e) => `.${e}`).join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label="Escolher anexos"
            onChange={(e) => adicionar(e.target.files)}
            disabled={enviando || arquivos.length >= ANEXOS_MAX}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={enviando || arquivos.length >= ANEXOS_MAX}
            onClick={() => refArquivo.current?.click()}
            aria-describedby={idLimites}
          >
            <Paperclip className="size-4" aria-hidden /> Anexar
          </Button>
          {/* O nome do botão é fixo; o andamento vai para a região viva ao lado (o rótulo visível ainda muda). */}
          <Button type="submit" size="sm" disabled={!podeEnviar} aria-label="Enviar mensagem">
            <Send className="size-4" aria-hidden />
            {situacao || "Enviar"}
          </Button>
          <span role="status" className="sr-only">
            {situacao}
          </span>
        </div>
      </div>
    </form>
  );
}
