import { permanentRedirect } from "next/navigation";

/** O catálogo de disciplinas virou a lente "Todas as versões" da tela única (spec 2026-09-30, §6). */
export default function DisciplinasConfigPage() {
  permanentRedirect("/configuracoes/nomenclatura/todas");
}
