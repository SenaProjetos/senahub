/**
 * Estrutura organizacional a partir dos catálogos: quem ocupa cada cargo e, em cada departamento,
 * os cargos com as pessoas. Pura (sem I/O): a tela de Cargos e departamentos recebe a lista de
 * pessoas uma vez e agrupa aqui.
 *
 * Cargo e departamento são independentes no cadastro (a pessoa tem um de cada, `User.cargoId` e
 * `User.departamentoId`), então "os cargos de um departamento" são os cargos das pessoas dele — não
 * existe vínculo cargo → departamento no banco.
 */

export type PessoaCatalogo = {
  id: string;
  nome: string;
  ativo: boolean;
  cargoId: string | null;
  departamentoId: string | null;
};

type ItemCatalogo = { id: string; nome: string };

/** Quem ocupa o cargo. Inativos só contam: a contagem "Em uso" os inclui, a lista não. */
export function pessoasDoCargo(pessoas: PessoaCatalogo[], cargoId: string) {
  const doCargo = pessoas.filter((p) => p.cargoId === cargoId);
  return {
    ativas: doCargo.filter((p) => p.ativo).sort(porNome),
    inativas: doCargo.filter((p) => !p.ativo).length,
  };
}

/**
 * O departamento por cargo, na ordem do catálogo de cargos; quem não tem cargo vai por último em
 * "Sem cargo" (`cargo: null`). Cargo sem ninguém ativo no departamento não aparece.
 */
export function estruturaDoDepartamento(pessoas: PessoaCatalogo[], departamentoId: string, cargos: ItemCatalogo[]) {
  const doDepto = pessoas.filter((p) => p.departamentoId === departamentoId);
  const ativas = doDepto.filter((p) => p.ativo);
  const grupos: { cargo: ItemCatalogo | null; pessoas: PessoaCatalogo[] }[] = [];
  for (const cargo of cargos) {
    const doCargo = ativas.filter((p) => p.cargoId === cargo.id);
    if (doCargo.length > 0) grupos.push({ cargo, pessoas: doCargo.sort(porNome) });
  }
  const conhecidos = new Set(cargos.map((c) => c.id));
  const semCargo = ativas.filter((p) => p.cargoId === null || !conhecidos.has(p.cargoId));
  if (semCargo.length > 0) grupos.push({ cargo: null, pessoas: semCargo.sort(porNome) });
  return { grupos, inativas: doDepto.length - ativas.length };
}

function porNome(a: PessoaCatalogo, b: PessoaCatalogo) {
  return a.nome.localeCompare(b.nome, "pt-BR");
}
