import {
  File as FileIcon,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
} from "lucide-react";
import { extDe } from "@/modules/uploads/estrutura";

/**
 * Ícone por extensão de arquivo — extraído para arquivo próprio (sem "use client") porque
 * é usado tanto por `arquivos-explorer.tsx` quanto por `pasta-tree-view.tsx`; um importar
 * do outro criaria um ciclo de módulos.
 */
export function IconeArquivo({ nome }: { nome: string }) {
  const ext = extDe(nome);
  if (ext === "pdf") return <FileText className="size-4 shrink-0 text-destructive" />;
  if (["dwg", "dxf", "dwf"].includes(ext)) return <FileCode className="size-4 shrink-0 text-primary" />;
  if (["xls", "xlsx", "doc", "docx", "txt"].includes(ext)) return <FileSpreadsheet className="size-4 shrink-0 text-success" />;
  if (["ifc", "ifcxml", "ifczip"].includes(ext)) return <FileCode className="size-4 shrink-0 text-violet-500" />;
  if (["zip", "rar", "7z", "tqs", "rvt", "skp", "qibzip"].includes(ext)) return <FileArchive className="size-4 shrink-0 text-warning" />;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return <ImageIcon className="size-4 shrink-0 text-pink-500" />;
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}
