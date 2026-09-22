"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import type { PranchaCatalogoRow } from "@/modules/projetos/pranchas/queries";
import { ListaMestreConfigView } from "@/components/configuracoes/lista-mestre-config-view";
import { VersaoProjetoSeletor, type VersaoDisponivel } from "@/components/projetos/arquivos/versao-projeto-seletor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Nomenclatura = { exigir: boolean; exigirFase: boolean; padrao: string };

const ROTULO_CATEGORIA: Record<string, string> = { fase: "Fases", tipo: "Tipos", folha: "Folhas" };

/**
 * Padrão de nomenclatura e siglas próprias do projeto — moraram na aba Lista Mestre até ela
 * virar só a geração do arquivo -LMS. Ficam ao lado de "Enviar documentos" porque é quem nomeia
 * e envia arquivo que mais precisa saber qual padrão vale; por isso o RESUMO é visível para
 * todo mundo que vê a aba e só a edição fica atrás de `configuracoes:gerir`.
 */
export function NomenclaturaProjetoButton({
  projetoId,
  nomenclaturaProjeto,
  nomenclaturaGlobal,
  siglasProjeto,
  podeEditar,
  versoes,
  versaoAtualId,
  personalizado,
}: {
  projetoId: string;
  nomenclaturaProjeto: Nomenclatura & { definido: boolean };
  nomenclaturaGlobal: Nomenclatura;
  siglasProjeto: PranchaCatalogoRow[];
  podeEditar: boolean;
  /** Versões PUBLICADAS, para o seletor "Padrão: v1 · v2 · Personalizado" (D3). */
  versoes: VersaoDisponivel[];
  versaoAtualId: string | null;
  personalizado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const siglasAtivas = siglasProjeto.filter((s) => s.ativo);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Tags className="size-3.5" /> Nomenclatura
      </Button>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nomenclatura do projeto</DialogTitle>
          <DialogDescription>
            Como o nome dos arquivos é reconhecido no envio, e as siglas válidas só neste projeto (somam-se às
            globais de Configurações → Lista Mestre).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Padrão de nomenclatura</h3>
              <Badge variant="outline" className={personalizado ? "border-primary/40 bg-primary/10" : undefined}>
                {personalizado ? "Padrão próprio" : "Segue uma versão"}
              </Badge>
            </div>
            <VersaoProjetoSeletor
              projetoId={projetoId}
              versoes={versoes}
              versaoAtualId={versaoAtualId}
              personalizado={personalizado}
              podeEditar={podeEditar}
              nomenclaturaProjeto={nomenclaturaProjeto}
              nomenclaturaGlobal={nomenclaturaGlobal}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Siglas deste projeto</h3>
            {podeEditar ? (
              <ListaMestreConfigView catalogos={siglasProjeto} projetoId={projetoId} />
            ) : siglasAtivas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma sigla própria — valem só as globais.</p>
            ) : (
              <dl className="space-y-2 text-sm">
                {["fase", "tipo", "folha"].map((categoria) => {
                  const itens = siglasAtivas.filter((s) => s.categoria === categoria);
                  if (itens.length === 0) return null;
                  return (
                    <div key={categoria} className="flex flex-wrap items-baseline gap-1.5">
                      <dt className="w-16 shrink-0 text-xs text-muted-foreground">{ROTULO_CATEGORIA[categoria]}</dt>
                      {itens.map((s) => (
                        <dd key={s.id}>
                          <Badge variant="outline" title={s.nome}>
                            <span className="font-mono">{s.sigla}</span>&nbsp;— {s.nome}
                          </Badge>
                        </dd>
                      ))}
                    </div>
                  );
                })}
              </dl>
            )}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
