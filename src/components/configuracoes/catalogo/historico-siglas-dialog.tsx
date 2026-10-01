"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rotuloExisteEm, type LinhaTodas } from "@/modules/projetos/nomenclatura/catalogo/todas";
import { SiglaOficial, SiglaSinonimo } from "./sigla-chips";

/**
 * Histórico de siglas de um item, só leitura (spec §4.3 — substitui "Siglas por versão"): cada sigla
 * com o papel e a faixa efetiva. Mudar sigla é dentro de uma versão; o link leva até lá.
 */
export function HistoricoSiglasDialog({
  linha,
  hrefAbrir,
  versaoAbrir,
  onFechar,
}: {
  linha: LinhaTodas;
  hrefAbrir: string;
  versaoAbrir: number;
  onFechar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Siglas de {linha.nome} — todas as versões</DialogTitle>
          <DialogDescription>Só leitura. Existe em: {linha.existeEm}.</DialogDescription>
        </DialogHeader>
        {linha.siglas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sigla cadastrada em versão nenhuma.</p>
        ) : (
          <ul className="divide-y rounded-sm border">
            {linha.siglas.map((s) => (
              <li key={`${s.sigla}-${s.faixa.versaoDesde}-${s.oficial}`} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                {s.oficial ? <SiglaOficial sigla={s.sigla} /> : <SiglaSinonimo sigla={s.sigla} />}
                <span className="text-muted-foreground">{s.oficial ? "oficial" : "sinônimo"}</span>
                <span className="ml-auto">{rotuloExisteEm(s.faixa)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Siglas mudam dentro de uma versão:{" "}
          <Link href={hrefAbrir} className="text-primary hover:underline">
            abrir a v{versaoAbrir}
          </Link>
          .
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
