import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISUALIZAVEL = /\.(pdf|png|jpe?g|webp|gif)$/i;

/** Ver (PDF/imagem, em nova aba) e baixar o anexo de um pedido de abono. */
export function AnexoAbono({ id, nome }: { id: string; nome: string | null }) {
  const url = `/api/rh/abono/${id}/atestado`;
  const podeVer = !nome || VISUALIZAVEL.test(nome);
  return (
    <span className="inline-flex items-center gap-1">
      {podeVer && (
        <Button size="sm" variant="ghost" render={<a href={`${url}?ver=1`} target="_blank" rel="noopener noreferrer" />}>
          <Eye className="size-3.5" /> Ver
        </Button>
      )}
      <Button size="sm" variant="ghost" render={<a href={url} download />}>
        <Download className="size-3.5" /> Baixar
      </Button>
    </span>
  );
}
