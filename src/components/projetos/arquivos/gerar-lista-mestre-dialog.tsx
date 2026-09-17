"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, ListChecks, Loader2 } from "lucide-react";
import type { LinhaListaMestre } from "@/modules/projetos/lista-mestre/montar";
import { editarMetadadosDocumento } from "@/modules/uploads/actions";
import { enviarArquivoComProgresso } from "@/components/projetos/upload-progresso";
import { validarListaMestreGerada } from "@/modules/projetos/lista-mestre/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Previa = {
  nome: string;
  faseId: string;
  tipoId: string;
  tipoNome: string;
  disciplinaNome: string;
  documentoExistenteId: string | null;
  linhas: LinhaListaMestre[];
};

async function lerErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { error?: string };
    return corpo.error ?? `Falha (${resposta.status}).`;
  } catch {
    return `Falha (${resposta.status}).`;
  }
}

/**
 * Gera a Lista Mestre de uma disciplina a partir dos documentos VALIDADOS em Pranchas e a salva
 * como documento do tipo Lista Mestre (PDF + XLSX na mesma revisão). O servidor só monta os
 * arquivos; o envio passa pela rota de upload de sempre, então gerar de novo cria a próxima
 * revisão do mesmo documento, com histórico e permissão de envio iguais aos de qualquer arquivo.
 */
export function GerarListaMestreButton({
  projetoId,
  disciplinas,
  podeEditarMetadados,
  podeValidar,
}: {
  projetoId: string;
  /** Só disciplinas em que a pessoa pode enviar e que usam pacotes (pasta não tem Lista Mestre). */
  disciplinas: { id: string; nome: string }[];
  podeEditarMetadados: boolean;
  /** Quem gera nem sempre valida — sem isso a lista fica pendente e some do link público. */
  podeValidar: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [disciplinaId, setDisciplinaId] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  // Só a prévia da ÚLTIMA disciplina escolhida entra — trocar rápido não deixa a resposta
  // atrasada de outra disciplina ocupar a tela (e virar o arquivo gerado).
  const pedidoAtual = useRef<string | null>(null);

  const nomesDisciplina = Object.fromEntries(disciplinas.map((d) => [d.id, d.nome]));

  const urlDe = (formato: "json" | "pdf" | "xlsx", id: string) =>
    `/api/projetos/${projetoId}/lista-mestre?${new URLSearchParams({ disciplinaId: id, formato })}`;

  async function escolher(id: string) {
    pedidoAtual.current = id;
    setDisciplinaId(id);
    setPrevia(null);
    setErro(null);
    setCarregando(true);
    try {
      const r = await fetch(urlDe("json", id), { cache: "no-store" });
      const resultado = r.ok ? { previa: (await r.json()) as Previa } : { erro: await lerErro(r) };
      if (pedidoAtual.current !== id) return;
      if (resultado.previa) setPrevia(resultado.previa);
      else setErro(resultado.erro ?? null);
    } catch {
      if (pedidoAtual.current === id) setErro("Não foi possível montar a prévia. Verifique a conexão.");
    } finally {
      if (pedidoAtual.current === id) setCarregando(false);
    }
  }

  async function baixarArquivo(formato: "pdf" | "xlsx", id: string, nome: string): Promise<File> {
    const r = await fetch(urlDe(formato, id), { cache: "no-store" });
    if (!r.ok) throw new Error(await lerErro(r));
    return new File([await r.blob()], `${nome}.${formato}`, { type: r.headers.get("Content-Type") ?? "" });
  }

  async function gerar() {
    if (!previa || !disciplinaId) return;
    setGerando(true);
    try {
      const [pdf, xlsx] = await Promise.all([
        baixarArquivo("pdf", disciplinaId, previa.nome),
        baixarArquivo("xlsx", disciplinaId, previa.nome),
      ]);
      // Com Lista Mestre anterior, os arquivos entram como nova versão DELA (o nome do
      // documento não muda; o arquivo enviado leva o nome novo) — é o mesmo caminho do backup
      // renomeado. Sem anterior, o documento nasce pelo nome.
      const comum = {
        disciplinaId,
        pacote: "A",
        faseId: previa.faseId,
        tipoId: previa.tipoId,
        ...(previa.documentoExistenteId ? { versaoDeDocumentoId: previa.documentoExistenteId } : {}),
      };
      // PDF abre a revisão; a planilha entra na MESMA revisão (como PDF+DWG de uma prancha).
      const primeiro = await enviarArquivoComProgresso(pdf, { ...comum, nome: pdf.name, novaRevisaoAgrupada: true }, () => {});
      if (!primeiro.ok || !primeiro.revisaoId) throw new Error(primeiro.motivo ?? "Falha ao salvar o PDF.");
      const segundo = await enviarArquivoComProgresso(xlsx, { ...comum, nome: xlsx.name, revisaoDeId: primeiro.revisaoId }, () => {});
      if (!segundo.ok) throw new Error(segundo.motivo ?? "O PDF foi salvo, mas a planilha falhou.");

      // A lista nasce validada: ela só enumera documentos que já passaram pela validação, e é
      // `validado` que decide o que o link público mostra ao cliente.
      if (podeValidar) {
        const v = await validarListaMestreGerada({ revisaoId: primeiro.revisaoId });
        if (!v.ok) toast.error(`Lista Mestre salva, mas não foi validada: ${v.error}`);
      } else {
        toast.info("Lista Mestre salva como pendente — valide na aba Arquivos para o cliente vê-la.");
      }

      // Título certo, não palpite: é a Lista Mestre desta disciplina. Não pisa em título já dado.
      if (podeEditarMetadados && primeiro.documentoId && !primeiro.tituloAtual) {
        const r = await editarMetadadosDocumento({
          documentoId: primeiro.documentoId,
          titulo: `${previa.tipoNome} — ${previa.disciplinaNome}`,
        });
        if (!r.ok) toast.error(`Lista Mestre salva, mas o título não: ${r.error}`);
      }
      toast.success(`Lista Mestre de ${previa.disciplinaNome} salva em Pranchas (${previa.linhas.length} documento(s)).`);
      setAberto(false);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGerando(false);
    }
  }

  function alternar(proximo: boolean) {
    if (gerando) return;
    setAberto(proximo);
    if (!proximo) {
      pedidoAtual.current = null;
      setCarregando(false);
      setDisciplinaId(null);
      setPrevia(null);
      setErro(null);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={alternar}>
      <Button size="sm" variant="outline" onClick={() => alternar(true)} disabled={disciplinas.length === 0}>
        <ListChecks className="size-3.5" /> Gerar Lista Mestre
      </Button>
      <DialogContent className="sm:max-w-3xl" showCloseButton={!gerando}>
        <DialogHeader>
          <DialogTitle>Gerar Lista Mestre</DialogTitle>
          <DialogDescription>
            Lista os documentos de Pranchas com arquivo validado e salva o resultado (PDF + XLSX) na própria
            disciplina. Gerar de novo cria a próxima revisão.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="max-w-sm space-y-1.5">
            <Label>Disciplina</Label>
            <Select
              value={disciplinaId ?? ""}
              items={nomesDisciplina}
              onValueChange={(v) => v && void escolher(v)}
              disabled={gerando}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {disciplinas.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {carregando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Montando a lista…
            </p>
          )}
          {erro && <p className="rounded-sm border border-warning/40 bg-warning/5 p-2 text-sm">{erro}</p>}

          {previa && disciplinaId && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-mono text-primary">{previa.nome}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {previa.linhas.length} documento(s) validado(s)
                    {previa.documentoExistenteId ? " · entra como nova revisão da Lista Mestre atual" : ""}
                  </span>
                </p>
                <div className="flex gap-2 text-xs">
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={urlDe("pdf", disciplinaId)}>
                    <FileDown className="size-3" /> Baixar PDF
                  </a>
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={urlDe("xlsx", disciplinaId)}>
                    <FileDown className="size-3" /> Baixar XLSX
                  </a>
                </div>
              </div>
              <div className="max-h-[45svh] overflow-auto rounded-sm border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b bg-card text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">Nº</th>
                      <th className="px-2 py-1.5">Documento</th>
                      <th className="px-2 py-1.5">Título</th>
                      <th className="px-2 py-1.5">Rev.</th>
                      <th className="px-2 py-1.5">Formatos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previa.linhas.map((l) => (
                      <tr key={l.documento}>
                        <td className="px-2 py-1 font-mono">{l.numero === null ? "—" : String(l.numero).padStart(4, "0")}</td>
                        <td className="px-2 py-1 font-mono">{l.documento}</td>
                        <td className={l.titulo ? "px-2 py-1" : "px-2 py-1 text-muted-foreground"}>{l.titulo || "sem título"}</td>
                        <td className="px-2 py-1 font-mono">{l.revisao || "—"}</td>
                        <td className="px-2 py-1">{l.formatos.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previa.linhas.some((l) => !l.titulo) && (
                <p className="text-xs text-muted-foreground">
                  Documento sem título sai com o campo vazio — dá para completar na lista de documentos e gerar de novo.
                </p>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => alternar(false)} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={() => void gerar()} disabled={!previa || gerando}>
            {gerando ? "Gerando…" : "Gerar e salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
