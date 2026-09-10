---
titulo: Deliberação — Guia de uso de Projetos (F1)
descricao: Ata sobre o guia de formação do setor Projetos e as divergências achadas na conferência contra o código.
resumo: Guia de Projetos publicado em /guias/projetos; conferência revelou o descompasso do cartão Pendências críticas.
tags: [deliberação, conselho, projetos, guia de uso, formação, apontamentos]
palavras-chave: [deliberação, ata, guia de uso, projetos, pendências, apontamentos, disciplina, prazo planejado]
sinonimos: [ata técnica]
---

# Deliberação — Guia de uso de Projetos (F1)

- **Data:** 2026-09-10
- **Funcionalidades:** `/guias/projetos`, botão "Guia de uso" em `/projetos`.
- **Plano:** [`2026-09-09-guias-de-uso-in-app.md`](../../superpowers/plans/2026-09-09-guias-de-uso-in-app.md) (F1)

## Participantes
Presidente, Iniciante, Treinamento, Projetos, Backend, Segurança, Revisor Técnico.

## Contexto

Segunda fase do plano de Guias de uso, e o primeiro guia escrito do zero sobre o formato
compartilhado da F0. O setor Projetos foi escolhido por ter a maior audiência (todos os perfis
internos passam por ele) e jargão próprio denso.

## Descobertas (inspeção de código)

- **"Pendências" tem dois significados na mesma tela.** `visaoGeralProjeto()` monta o objeto
  `pendencias` somando **cinco** fontes — apontamentos de prancha (`Pendencia`), apontamentos da
  Compatibilização (`ApontamentoCoordenacao`), tarefas abertas, `SolicitacaoRevisao` pendente e
  aprovações aguardando (disciplina com `aprovacaoSolicitadaEm` + `AceiteCliente` pendente). O
  cartão exibe esse `total` sob o rótulo **"Pendências críticas"**, e o link "Ver pendências" aponta
  para `/pendencias` — cuja `metadata.title` e `<h1>` dizem **"Apontamentos"** e que lista apenas a
  primeira fonte.
- **O glossário previsto no plano de 2026-07-20 estava errado.** Ele definia "Pendência — item
  aberto que trava o andamento". No código, `Pendencia` é o pino ancorado numa página de PDF, com
  número por prancha, âncora de texto que sobrevive à revisão, severidade e anexos.
- **`aceitarProposta` cria menos do que parece, de propósito.** Gera código do ano
  (`proximoCodigoProjeto`), cria as disciplinas a partir dos itens e põe o responsável da negociação
  como coordenador — mas **não** define responsável por disciplina nem monta a EAP, porque a
  proposta não carrega essa informação. O guia passou a dizer isso explicitamente: é o que justifica
  as etapas de Planejar e Equipe existirem.
- **Um `cliente` alcança `/projetos`.** Os dados chegam corretamente limitados ao projeto dele
  (`escopoProjeto`), mas a página renderiza — e o botão "Guia de uso" acrescentado nesta fase
  aparecia para ele, levando a 404.
- Confirmados contra o código: `validarEntrega` recusa disciplina sem responsável; apontamento em
  estado aberto bloqueia a validação da entrega; `EapTarefa` guarda `inicioBaseline`/`fimBaseline`
  (daí "plano × realidade"); a saúde lê o prazo **planejado**, não o de contrato.

## Opiniões dos Especialistas

- **Iniciante:** o descompasso do cartão de pendências é exatamente o tipo de coisa que faz alguém
  achar que o sistema está errado e parar de confiar no número.
- **Projetos:** o vaivém `Entregue ⇄ Em revisão` é normal e precisa estar dito, senão a pessoa
  entende revisão como retrabalho mal-feito.
- **Segurança:** botão visível que responde 404 é a mesma assimetria que a F0 resolveu no menu. O
  sinal tem de vir do servidor, pelo mesmo eixo.
- **Backend:** a escolha entre os dois fluxos de conclusão é **por disciplina**, não por tipo de
  projeto — `disciplinaUsaPastas()` documenta que usar o tipo como gate trava a disciplina nos dois
  fluxos ao mesmo tempo.
- **Treinamento:** manter fora do guia o que é interno de implementação (nome de coluna, valor
  gravado × rótulo). O leitor só vê o rótulo.

## Discussão

Consenso em documentar o descompasso de "pendências" como armadilha **e** registrá-lo como
divergência aberta, em vez de tratar como detalhe de redação. O guia explica o comportamento atual;
a decisão de alinhar cartão e tela é de produto, não de documentação.

Sobre os marcos: cinco, não seis. "Revisar" e "Entregar" seriam dois marcos para o que é um estado
só com um laço (`entregue ⇄ em_revisao`) — mesma razão pela qual `ETAPAS_DISCIPLINA` tem quatro
etapas e não cinco. A etapa `#antes` foi dispensada: Projetos não tem pré-requisito de configuração
como o Comercial tinha.

## Divergências

Nenhuma quanto ao conteúdo. Registrada a ressalva de **Segurança**: a correção do botão vale como
precedente — **toda página-âncora alcançável por perfil externo** precisa do sinal `mostrarGuia`, não
só `/projetos`. As fases F2–F4 devem conferir isso em `/financeiro`, `/rh` e `/licitacoes`.

## Decisão Final

- Publicado o guia em `/guias/projetos` (`components/projetos/guia-projetos-view.tsx`): 13 termos de
  vocabulário, 5 etapas, 6 armadilhas, 7 dúvidas.
- `lib/guias.ts`: setor `projetos` passa a `estado: "pronto"`; entrada no `VIEWS` de `[setor]`.
- Botão "Guia de uso" em `/projetos`, atrás de `mostrarGuia` calculado no servidor por
  `tipoEfetivo()`.
- Stub `docs/manual/projetos/guia-iniciante.md` + entrada no `search-index.json`.
- Divergências F1-1, F1-2 e F1-3 registradas na §12 do plano.

## Melhorias Sugeridas

- Decidir o destino de F1-1: cartão detalhado por fila, link para outro destino, ou alinhar rótulos.
- Conferir o precedente de F1-2 nas páginas-âncora das fases seguintes.

## Pendências

- F1-1 e F1-3 seguem abertas (ver §12 do plano).
