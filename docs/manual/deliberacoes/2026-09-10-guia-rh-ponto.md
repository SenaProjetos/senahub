---
titulo: Deliberação — Guia de uso de RH e Ponto (F3)
descricao: Ata sobre o guia de formação de RH e Ponto e os limites declarados do cálculo de férias.
resumo: Guia de RH e Ponto publicado; contratação (não cargo) é o eixo, e o cálculo de férias é simplificado.
tags: [deliberação, conselho, rh, ponto, guia de uso, férias, banco de horas, encargos]
palavras-chave: [deliberação, ata, guia de uso, rh, ponto, vínculo, contratação, banco de horas, férias, encargos]
sinonimos: [ata técnica]
---

# Deliberação — Guia de uso de RH e Ponto (F3)

- **Data:** 2026-09-10
- **Funcionalidades:** `/guias/rh-ponto`, botão "Guia de uso" em `/rh`.
- **Plano:** [`2026-09-09-guias-de-uso-in-app.md`](../../superpowers/plans/2026-09-09-guias-de-uso-in-app.md) (F3)

## Participantes
Presidente, Iniciante, Treinamento, RH, Backend, Jurídico, Revisor Técnico.

## Contexto

Quarta fase do plano. RH e Ponto foi priorizado por juntar jargão pesado com sensibilidade
jurídica — é o setor em que uma frase mal escrita num guia pode ser lida como orientação
trabalhista.

## Descobertas (inspeção de código)

- **O eixo é a contratação, não o cargo.** `CONTRATACOES_JORNADA = ["clt", "estagio"]` decide quem
  tem jornada controlada. `modules/rh/banco/queries.ts` documenta o caso concreto: um cargo
  administrativo contratado como CLT tem banco de horas e ficava de fora quando o filtro era por
  `role`; um `clt` que virou PJ não tem e entrava.
- **A apuração usa o vínculo que cobre o mês pedido**, nunca `User.vinculoAtivo` — senão um
  estagiário promovido a CLT em julho teria junho zerado.
- **Sem jornada controlada, o mês inteiro é zerado.** PJ, autônomo e pró-labore não acumulam falta
  em nenhum cálculo de saldo. Saldo zero é o resultado correto, não registro faltando.
- **Dia passado com ponta aberta conta só os pares fechados** — o motor nunca extrapola o horário
  de saída.
- **Banco de horas fechado é snapshot.** `BancoHorasMensal` guarda o valor congelado; corrigir o
  cálculo não conserta o que já foi gravado, daí existir uma ação de recálculo dos meses fechados,
  do mais antigo para o mais recente, por upsert idempotente.
- **Ajuste de ponto tem dois caminhos assimétricos**, e o rascunho do guia descrevia errado: o
  ajuste do **próprio** ponto é "aplicado sem ciência", só com justificativa; o ajuste feito por
  **gestor** aplica na hora, mas cria `pendente_ciencia` e notifica o colaborador para confirmar ou
  contestar.
- **Férias seguem uma regra simplificada** declarada no próprio arquivo: 12 meses → 30 dias, janela
  concessiva de 12 meses, sem faltas que reduzem o direito, sem fracionamento e sem abono.
- **Faixas de INSS/IRRF não vêm embutidas.** Sem `EncargoFaixa` cadastrada, o motor devolve zero de
  propósito, em vez de chutar tabela.

## Opiniões dos Especialistas

- **RH:** "contratação manda, não cargo" tem de ser a regra do topo. É o erro que faz alguém
  procurar a pessoa errada na lista.
- **Jurídico:** o guia não pode soar como orientação trabalhista. A simplificação do cálculo de
  férias precisa estar dita **no guia e no stub**, não só no código.
- **Iniciante:** "meu saldo está zerado e eu trabalhei" é a primeira pergunta de qualquer PJ. Tem de
  estar nas dúvidas.
- **Backend:** o botão em `/rh` não precisa de `mostrarGuia` — o `requireRole` da página já admite
  só papéis internos. Repetir o gate seria código morto.
- **Treinamento:** a assimetria do ajuste (próprio × gestor) é uma boa notícia mal contada em
  qualquer lugar do sistema. Vale explicitar que ninguém mexe no ponto de alguém sem aviso.

## Discussão

Consenso em tratar o setor com uma regra editorial extra: **o guia descreve o que o sistema faz e
diz quando a regra implementada é simplificada**, sem afirmar o que a legislação exige. Isso virou
um aviso explícito na etapa de férias e um bloco no stub do manual.

Sobre o gate do botão: a F1 abriu o precedente e a F2 o aplicou preventivamente, mas ele vale para
páginas que **renderizam** para perfil externo. `/rh` não é uma delas, e o plano foi corrigido para
dizer isso — evita que a F4 aplique o gate por reflexo.

## Divergências

Nenhuma. Registrado que F3-2 (regra simplificada de férias) é **decisão de escopo**, não defeito: se
o escritório precisar da regra completa, é feature nova.

## Decisão Final

- Publicado o guia em `/guias/rh-ponto` (`components/rh/guia-rh-ponto-view.tsx`): 13 termos,
  5 marcos (Vínculo → Bater → Conferir → Fechar → Pagar) mais uma etapa própria de Férias,
  6 armadilhas e 7 dúvidas.
- `lib/guias.ts`: setor `rh-ponto` passa a `estado: "pronto"`; entrada no `VIEWS` de `[setor]`.
- Botão "Guia de uso" em `/rh`, sem gate adicional (justificado em comentário no código).
- Stub `docs/manual/rh-ponto/guia-iniciante.md`, com aviso jurídico, + entrada no
  `search-index.json`.
- Divergências F3-1 a F3-3 registradas na §12 do plano.

## Melhorias Sugeridas

- A tela de Encargos poderia avisar quando não há faixa cadastrada, em vez de devolver zero em
  silêncio (F3-3).

## Pendências

- F3-2 e F3-3 seguem abertas (ver §12 do plano).
- Issues de F0-1, F1-1 e F2-1 continuam pendentes de `gh auth login`.
