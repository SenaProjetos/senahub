import type { EstagioNegociacao, TipoAtividade } from "@/generated/prisma/client";
import { ESTAGIO_LABEL } from "@/modules/comercial/jornada";

/**
 * Eventos automáticos da timeline (F3.2). Puro: descreve o que aconteceu, sem tocar no banco.
 *
 * Todo evento aqui nasce `SISTEMA` — são coisas que o fluxo registra sozinho, sem ninguém clicar
 * em "anotar". O registro MANUAL (ligação, e-mail, nota digitada por uma pessoa) é a F3.4, e usa
 * os outros valores de `TipoAtividade`.
 *
 * ── A fronteira com o `AuditLog`, que a F3.3 vai formalizar ──────────────────────────────────
 * `Atividade` é NARRATIVA: "Estágio movido de Orçamento para Proposta enviada" — feita para
 * alguém ler numa timeline e entender a história da empresa. `AuditLog` é TÉCNICO: quem, quando,
 * valor anterior e novo, para auditar. Os dois coexistem de propósito; o `metadata` daqui carrega
 * só o que a narrativa precisa para ser reconstruída na tela, não o diff completo.
 */

export type EventoAtividade =
  | { evento: "EMPRESA_CADASTRADA"; nome: string }
  | { evento: "CONTATO_CADASTRADO"; nome: string; cargo?: string | null }
  | { evento: "PROSPECCAO_CRIADA"; nome: string }
  | { evento: "ESTAGIO_ALTERADO"; de: EstagioNegociacao; para: EstagioNegociacao }
  | { evento: "NEGOCIACAO_CRIADA"; titulo: string; deProspeccao: boolean }
  | { evento: "PROPOSTA_CRIADA"; numero: string; titulo: string }
  | { evento: "PROPOSTA_ENVIADA"; numero: string; porEmail: boolean }
  | { evento: "PROPOSTA_REVISADA"; numero: string; versao: number }
  | { evento: "PROPOSTA_ACEITA"; numero: string }
  | { evento: "PROJETO_CRIADO"; codigo: string; nome: string }
  | { evento: "NEGOCIACAO_PERDIDA"; motivo: string | null; concorrente: string | null };

export type AtividadeDescrita = {
  tipo: TipoAtividade;
  descricao: string;
  metadata: Record<string, unknown>;
};

/**
 * Texto e metadados de um evento automático.
 *
 * A descrição é escrita para ser lida por quem vende, não por quem programa: sem id, sem nome de
 * campo, sem jargão de banco. Quem quiser o dado estruturado usa o `metadata`.
 */
export function descreverEvento(ev: EventoAtividade): AtividadeDescrita {
  switch (ev.evento) {
    case "EMPRESA_CADASTRADA":
      return {
        tipo: "SISTEMA",
        descricao: `Empresa cadastrada: ${ev.nome}`,
        metadata: { evento: ev.evento, nome: ev.nome },
      };

    case "CONTATO_CADASTRADO":
      return {
        tipo: "SISTEMA",
        descricao: ev.cargo
          ? `Contato cadastrado: ${ev.nome} (${ev.cargo})`
          : `Contato cadastrado: ${ev.nome}`,
        metadata: { evento: ev.evento, nome: ev.nome, cargo: ev.cargo ?? null },
      };

    case "PROSPECCAO_CRIADA":
      return {
        tipo: "SISTEMA",
        descricao: `Prospecção criada: ${ev.nome}`,
        metadata: { evento: ev.evento, nome: ev.nome },
      };

    case "ESTAGIO_ALTERADO":
      return {
        tipo: "SISTEMA",
        descricao: `Estágio movido de "${ESTAGIO_LABEL[ev.de]}" para "${ESTAGIO_LABEL[ev.para]}"`,
        // `de`/`para` crus no metadata porque a Fase 6 mede tempo-por-etapa a partir daqui —
        // parsear o texto da descrição para isso seria frágil e quebraria se o rótulo mudasse.
        metadata: { evento: ev.evento, de: ev.de, para: ev.para },
      };

    case "NEGOCIACAO_CRIADA":
      return {
        tipo: "SISTEMA",
        descricao: ev.deProspeccao
          ? `Prospecção qualificada — negociação criada: ${ev.titulo}`
          : `Negociação criada: ${ev.titulo}`,
        metadata: { evento: ev.evento, titulo: ev.titulo, deProspeccao: ev.deProspeccao },
      };

    case "PROPOSTA_CRIADA":
      return {
        tipo: "SISTEMA",
        descricao: `Proposta ${ev.numero} criada: ${ev.titulo}`,
        metadata: { evento: ev.evento, numero: ev.numero },
      };

    case "PROPOSTA_ENVIADA":
      return {
        tipo: "SISTEMA",
        descricao: ev.porEmail
          ? `Proposta ${ev.numero} enviada por e-mail ao cliente`
          : `Proposta ${ev.numero} marcada como enviada`,
        metadata: { evento: ev.evento, numero: ev.numero, porEmail: ev.porEmail },
      };

    case "PROPOSTA_REVISADA":
      return {
        tipo: "SISTEMA",
        descricao: `Proposta ${ev.numero} revisada (versão ${ev.versao})`,
        metadata: { evento: ev.evento, numero: ev.numero, versao: ev.versao },
      };

    case "PROPOSTA_ACEITA":
      return {
        tipo: "SISTEMA",
        descricao: `Proposta ${ev.numero} ACEITA pelo cliente`,
        metadata: { evento: ev.evento, numero: ev.numero },
      };

    case "PROJETO_CRIADO":
      return {
        tipo: "SISTEMA",
        descricao: `Projeto ${ev.codigo} criado: ${ev.nome}`,
        metadata: { evento: ev.evento, codigo: ev.codigo },
      };

    case "NEGOCIACAO_PERDIDA": {
      const partes = ["Negociação perdida"];
      if (ev.motivo) partes.push(`— ${ev.motivo}`);
      if (ev.concorrente) partes.push(`(concorrente: ${ev.concorrente})`);
      return {
        tipo: "SISTEMA",
        descricao: partes.join(" "),
        metadata: { evento: ev.evento, motivo: ev.motivo, concorrente: ev.concorrente },
      };
    }
  }
}
