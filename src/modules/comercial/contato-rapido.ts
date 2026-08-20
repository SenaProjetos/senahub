import { normalizarTelefone } from "@/modules/comercial/dedupe";

/**
 * Links de contato rápido (F2.16) — WhatsApp e e-mail direto do card e da ficha.
 *
 * Reaproveita `normalizarTelefone` da F1.12 (dedupe) em vez de repetir a regra: ela já resolve
 * DDI implícito, pontuação e as duas larguras (fixo com 10 dígitos, celular com 11). Duas
 * normalizações diferentes de telefone no mesmo módulo divergiriam na primeira exceção.
 *
 * ⚠️ **Registro manual, sem API.** O botão só ABRE a conversa; nada é enviado nem lido pelo
 * sistema. É o veredito do dono no roadmap (#28) — integração com a API do WhatsApp foi
 * rejeitada, e a interação registrada fica por conta do `registrarAtividade` (F3.4).
 */

/**
 * URL do WhatsApp para um telefone. `null` quando não há número utilizável — a UI usa isso para
 * **esconder** o botão, em vez de exibir um link que abriria o app numa conversa inexistente.
 *
 * `wa.me` exige os dígitos sem o `+`.
 */
export function linkWhatsApp(telefone: string | null | undefined, mensagem?: string): string | null {
  const e164 = normalizarTelefone(telefone ?? null);
  if (!e164) return null;
  const numero = e164.replace(/^\+/, "");
  const texto = mensagem?.trim();
  return texto
    ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/${numero}`;
}

/**
 * `mailto:` com assunto opcional. `null` sem e-mail — mesma lógica de esconder o botão.
 *
 * A validação é intencionalmente frouxa (tem `@` e um ponto depois): o objetivo é evitar abrir o
 * cliente de e-mail com lixo, não recusar endereços exóticos porém válidos. Validação estrita
 * mora no Zod, no momento do cadastro.
 */
export function linkEmail(email: string | null | undefined, assunto?: string): string | null {
  const e = email?.trim();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  const s = assunto?.trim();
  return s ? `mailto:${e}?subject=${encodeURIComponent(s)}` : `mailto:${e}`;
}
