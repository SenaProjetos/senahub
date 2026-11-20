"use client";

import { useId } from "react";
import { Trash2 } from "lucide-react";
import { LIMITE_COMENTARIO, LIMITE_TEXTO_MARCACAO } from "@/modules/portal/pedido-revisao/regras";
import { formatarMedida } from "@/modules/projetos/pendencias/medicao";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CampoAnexos } from "@/components/portal/pedir-revisao-dialog";
import { FERRAMENTAS_DO_CLIENTE } from "./barra-ferramentas";
import type { MarcacaoRascunho } from "./rascunho-local";

function rotuloDaForma(m: MarcacaoRascunho): string {
  const tipo = m.marcacao?.tipo ?? "ponto";
  const base = FERRAMENTAS_DO_CLIENTE.find((f) => f.tipo === tipo)?.rotulo ?? "Marcação";
  return tipo === "medida" && m.medidaMm ? `${base} ${formatarMedida(m.medidaMm)}` : base;
}

/**
 * Painel do pedido em edição: as marcações (texto editável, excluir), o comentário geral, os anexos e o envio. O mesmo
 * conteúdo serve à coluna lateral (tela larga) e à folha de baixo (celular).
 */
export function ListaMarcacoes({
  marcacoes,
  onTexto,
  onRemover,
  comentario,
  onComentario,
  arquivos,
  onArquivos,
  onEnviar,
  onDescartar,
  enviando,
}: {
  marcacoes: MarcacaoRascunho[];
  onTexto: (id: string, texto: string) => void;
  onRemover: (id: string) => void;
  comentario: string;
  onComentario: (v: string) => void;
  arquivos: File[];
  onArquivos: (a: File[]) => void;
  onEnviar: () => void;
  onDescartar: () => void;
  enviando: boolean;
}) {
  const idComentario = useId();
  const faltaTexto = marcacoes.some((m) => !m.texto.trim());
  const idDica = useId();
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
            Escolha uma ferramenta e marque na prancha onde está o que você quer mudar. As marcações são opcionais.
          </p>
        ) : (
          <ol className="space-y-2">
            {marcacoes.map((m, i) => (
              <li key={m.id} className="space-y-1 rounded-sm border p-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {rotuloDaForma(m)} · página {m.pagina}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemover(m.id)}
                    className="shrink-0 rounded-sm p-1 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Excluir a marcação ${i + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <textarea
                  aria-label={`O que mudar na marcação ${i + 1}`}
                  rows={2}
                  maxLength={LIMITE_TEXTO_MARCACAO}
                  className="w-full resize-y rounded-sm border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  value={m.texto}
                  onChange={(e) => onTexto(m.id, e.target.value)}
                />
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
          className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
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
