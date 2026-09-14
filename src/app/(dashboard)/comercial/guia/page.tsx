import { permanentRedirect } from "next/navigation";
import { rotaGuia } from "@/lib/guias";

/**
 * Endereço antigo do guia do Comercial. Os Guias de uso passaram a viver em `/guias/[setor]`
 * (N4 do plano `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`), porque setor ≠ rota e
 * `/[modulo]/guia` não generaliza — "Gestão" cobre seis telas independentes.
 *
 * Mantido como redirect: o link já circulou internamente.
 */
export default function GuiaComercialLegadoPage(): never {
  permanentRedirect(rotaGuia("clientes-comercial"));
}
