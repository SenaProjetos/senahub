"use client";

import { useId } from "react";
import { Crosshair, ImageOff, Trash2 } from "lucide-react";
import { LIMITE_COMENTARIO, LIMITE_TEXTO_MARCACAO } from "@/modules/portal/pedido-revisao/regras";
import { TAMANHO_MAX_IMAGEM_VISTA, type MarcaModeloLeitura } from "@/modules/portal/pedido-revisao/modelo-regras";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CampoAnexos } from "@/components/portal/pedir-revisao-dialog";
import type { MarcacaoModeloRascunho } from "@/components/portal/visualizador/rascunho-local";

/** Os campos de texto do modo pedir: o mesmo anel de foco dos campos do sistema (`Input`). */
export const CLASSE_CAMPO_TEXTO =
  "w-full resize-y rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Numero({ n, esmaecido = false }: { n: number; esmaecido?: boolean }) {
  return (
    <span
      className={
        esmaecido
          ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-[10px] font-bold text-background"
          : "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
      }
      aria-hidden
    >
      {n}
    </span>
  );
}

/**
 * Painel do pedido no modelo 3D em edição (spec 2026-11-20, "Pedir revisão no modelo"): as marcações (texto editável,
 * excluir, "ir para" a vista), o comentário geral, os anexos e o envio. O mesmo conteúdo serve à coluna lateral e à
 * folha de baixo no celular — o padrão de `ListaMarcacoes` da prancha.
 */
export function PainelPedidoModelo({
  marcacoes,
  rotuloDoModelo,
  temImagem,
  onTexto,
  onRemover,
  onIr,
  comentario,
  onComentario,
  arquivos,
  onArquivos,
  onEnviar,
  onDescartar,
  enviando,
}: {
  marcacoes: MarcacaoModeloRascunho[];
  rotuloDoModelo: (modeloId: string) => string;
  temImagem: (id: string) => boolean;
  onTexto: (id: string, texto: string) => void;
  onRemover: (id: string) => void;
  onIr: (id: string) => void;
  comentario: string;
  onComentario: (v: string) => void;
  arquivos: File[];
  onArquivos: (a: File[]) => void;
  onEnviar: () => void;
  onDescartar: () => void;
  enviando: boolean;
}) {
  const idComentario = useId();
  const idDica = useId();
  const faltaTexto = marcacoes.some((m) => !m.texto.trim());
  const dica = !comentario.trim()
    ? "Escreva o comentário geral para enviar."
    : faltaTexto
      ? "Escreva o que mudar em cada marcação."
      : null;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Marcações ({marcacoes.length})</h3>
        {marcacoes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Clique (ou toque) no elemento do modelo que você quer mudar. A vista atual vai junto com a marcação. As marcações são
            opcionais.
          </p>
        ) : (
          <ol className="space-y-2">
            {marcacoes.map((m, i) => (
              <li key={m.id} className="space-y-1 rounded-sm border p-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Numero n={i + 1} />
                  <span className="min-w-0 flex-1 truncate" title={rotuloDoModelo(m.modeloId)}>
                    {rotuloDoModelo(m.modeloId)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onIr(m.id)}
                    className="shrink-0 rounded-sm p-1 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Ir para a vista da marcação ${i + 1}`}
                    title="Ir para a vista"
                  >
                    <Crosshair className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemover(m.id)}
                    className="shrink-0 rounded-sm p-1 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Excluir a marcação ${i + 1}`}
                    title="Excluir"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <textarea
                  aria-label={`O que mudar na marcação ${i + 1}`}
                  rows={2}
                  maxLength={LIMITE_TEXTO_MARCACAO}
                  className={CLASSE_CAMPO_TEXTO}
                  value={m.texto}
                  onChange={(e) => onTexto(m.id, e.target.value)}
                />
                {!temImagem(m.id) && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ImageOff className="size-3 shrink-0" aria-hidden /> Sem imagem da vista: a equipe recebe o elemento e a vista.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idComentario}>Comentário geral (obrigatório)</Label>
        <textarea
          id={idComentario}
          rows={4}
          maxLength={LIMITE_COMENTARIO}
          aria-required
          className={CLASSE_CAMPO_TEXTO}
          placeholder="Explique o pedido para a equipe."
          value={comentario}
          onChange={(e) => onComentario(e.target.value)}
        />
      </div>

      <CampoAnexos arquivos={arquivos} onChange={onArquivos} />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onEnviar} disabled={enviando || dica !== null} aria-describedby={dica ? idDica : undefined}>
          {enviando ? "Enviando…" : "Enviar pedido"}
        </Button>
        <Button variant="ghost" onClick={onDescartar} disabled={enviando}>
          Descartar
        </Button>
      </div>
      {dica && (
        <p id={idDica} className="text-xs text-muted-foreground">
          {dica}
        </p>
      )}
    </div>
  );
}

/** Lista só de leitura das marcações de um pedido enviado (detalhe da coordenação), com "Ir para" cada vista. */
export function ListaMarcasLeitura({
  titulo,
  marcas,
  rotuloDoModelo,
  onIr,
  esmaecidas = false,
}: {
  titulo: string;
  marcas: MarcaModeloLeitura[];
  rotuloDoModelo: (modeloId: string) => string;
  onIr: (id: string) => void;
  esmaecidas?: boolean;
}) {
  if (marcas.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={titulo}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      <ol className="space-y-1.5">
        {marcas.map((m) => (
          <li key={m.id} className="flex items-start gap-2 rounded-sm border p-2 text-sm">
            <Numero n={m.numero} esmaecido={esmaecidas} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="break-words">{m.texto}</p>
              {esmaecidas && <p className="text-xs text-muted-foreground">Aguardando resposta da equipe</p>}
              <p className="truncate text-xs text-muted-foreground" title={rotuloDoModelo(m.modeloId)}>
                {rotuloDoModelo(m.modeloId)}
              </p>
            </div>
            {m.camera && (
              <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => onIr(m.id)}>
                <Crosshair className="size-3.5" /> Ir para
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A imagem da vista cabe no teto da rota (2 MB)? Se não, redesenha menor (metade da largura por vez, até 3 vezes).
 * Falhou = sem imagem (a marcação vale sem ela).
 */
export async function imagemQueCabe(blob: Blob): Promise<Blob | null> {
  let atual: Blob = blob;
  for (let tentativa = 0; atual.size > TAMANHO_MAX_IMAGEM_VISTA && tentativa < 3; tentativa++) {
    try {
      const bmp = await createImageBitmap(atual);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width / 2));
      canvas.height = Math.max(1, Math.round(bmp.height / 2));
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const menor = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!menor) return null;
      atual = menor;
    } catch {
      return null;
    }
  }
  return atual.size > TAMANHO_MAX_IMAGEM_VISTA ? null : atual;
}

/** Envia as imagens das vistas, uma marcação por requisição, depois de criado o pedido. Devolve quantas falharam. */
export async function enviarImagensDasVistas(pedidoId: string, envios: readonly { marcacaoId: string; imagem: Blob }[]): Promise<number> {
  let falhas = 0;
  for (const e of envios) {
    try {
      const fd = new FormData();
      fd.append("file", e.imagem, "vista.png");
      const res = await fetch(
        `/api/portal/pedidos/${encodeURIComponent(pedidoId)}/marcacoes/${encodeURIComponent(e.marcacaoId)}/imagem`,
        { method: "POST", body: fd },
      );
      if (!res.ok) falhas++;
    } catch {
      falhas++;
    }
  }
  return falhas;
}
