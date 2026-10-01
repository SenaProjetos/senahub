import { Badge } from "@/components/ui/badge";

/** Sigla oficial: a que vai no nome do arquivo. Borda cheia. */
export function SiglaOficial({ sigla }: { sigla: string }) {
  return (
    <Badge variant="outline" className="font-mono">
      {sigla}
    </Badge>
  );
}

/** Sinônimo: só reconhecido no envio, nunca escrito no nome. Borda tracejada, mais apagado. */
export function SiglaSinonimo({ sigla }: { sigla: string }) {
  return (
    <Badge
      variant="outline"
      className="border-dashed font-mono font-normal text-muted-foreground"
      title="Sinônimo: reconhecido no envio, nunca escrito no nome"
    >
      {sigla}
    </Badge>
  );
}
