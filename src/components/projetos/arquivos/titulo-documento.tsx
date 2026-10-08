"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogoDwg } from "@/components/dwg/visualizar-dwg-button";
import { useVoltaAtual } from "@/components/projetos/arquivos/use-volta-atual";
import { buscarStatusConversaoDwg } from "@/modules/dwg/actions";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";
import { comVolta } from "@/modules/uploads/volta-visualizador";
import { visualizadorDoDocumento } from "@/modules/uploads/visualizador-documento";
import { cn } from "@/lib/utils";

/**
 * Título do documento na lista: o clique abre o arquivo no visualizador (`visualizadorDoDocumento`) —
 * PDF no visualizador com pinos (nova aba, como o olho do badge), DWG no visualizador 2D, IFC na
 * Compatibilização. Os detalhes do documento saíram daqui para o ícone de informações e o menu.
 *
 * Título manual > "Conteúdo" da Lista Mestre > nome do arquivo. Só título ganha peso: quando cai
 * no nome, ele fica discreto para a numeração liderar a linha.
 */
export function TituloDocumento({
  projetoId,
  linha,
  podeCoordenacao,
}: {
  projetoId: string;
  linha: Pick<LinhaDoc, "titulo" | "tituloPrancha" | "nome" | "arquivos">;
  podeCoordenacao: boolean;
}) {
  const volta = useVoltaAtual();
  const [dwgAberto, setDwgAberto] = useState(false);
  const [consultando, setConsultando] = useState(false);

  const alvo = visualizadorDoDocumento(linha.arquivos, podeCoordenacao);
  const titulo = linha.titulo ?? linha.tituloPrancha;
  const texto = titulo ?? linha.nome;
  const dica = titulo ? `${titulo} — ${linha.nome}` : linha.nome;
  const classe = cn(
    "block h-auto min-w-0 max-w-full truncate p-0 text-left",
    titulo ? "font-medium" : "font-normal text-foreground/80",
  );

  if (!alvo) {
    return (
      <span className={classe} title={dica}>
        {texto}
      </span>
    );
  }

  if (alvo.tipo === "pdf" || alvo.tipo === "ifc") {
    const href =
      alvo.tipo === "pdf"
        ? comVolta(`/projetos/${projetoId}/arquivos/${alvo.uploadId}/visualizar`, volta)
        : `/projetos/${projetoId}/coordenacao`;
    return (
      <Button
        variant="link"
        className={classe}
        title={dica}
        render={
          <Link
            href={href}
            target={alvo.tipo === "pdf" ? "_blank" : undefined}
            rel={alvo.tipo === "pdf" ? "noopener" : undefined}
            aria-label={alvo.tipo === "pdf" ? `Visualizar ${texto}` : `Abrir ${texto} no visualizador BIM`}
          />
        }
      >
        {texto}
      </Button>
    );
  }

  // O DWG precisa estar convertido para abrir: pergunta o estado na hora do clique, em vez de a lista
  // inteira consultar a conversão de cada linha ao montar.
  async function abrirDwg(uploadId: string) {
    setConsultando(true);
    const s = await buscarStatusConversaoDwg(uploadId).catch(() => null);
    setConsultando(false);
    if (!s || s.status === "fila" || s.status === "processando") {
      toast.info("O desenho ainda está sendo convertido. Tente de novo em instantes.");
      return;
    }
    if (s.status === "erro") {
      // O detalhe técnico e o "tentar de novo" ficam no ícone de erro do badge DWG.
      toast.error("A conversão deste desenho falhou. Tente de novo pelo ícone ao lado do DWG.");
      return;
    }
    setDwgAberto(true);
  }

  return (
    <>
      <Button
        variant="link"
        className={cn(classe, "inline-flex items-center gap-1")}
        title={dica}
        aria-label={`Visualizar ${texto}`}
        disabled={consultando}
        onClick={() => void abrirDwg(alvo.uploadId)}
      >
        <span className="truncate">{texto}</span>
        {consultando && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />}
      </Button>
      <DialogoDwg aberto={dwgAberto} onAbertoChange={setDwgAberto} desenhoId={alvo.uploadId} titulo={alvo.nome} />
    </>
  );
}
