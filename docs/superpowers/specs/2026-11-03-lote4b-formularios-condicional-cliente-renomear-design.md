# Lote 4b — Formulários do briefing: pergunta condicional, modelo por cliente e migração de resposta ao renomear opção

Origem: as três funcionalidades que o [Lote 4](../plans/2026-11-02-lote4-inputs-modelos.md) deixou de fora. O dono mandou
seguir em 03/11/2026 sem perguntas; as decisões abaixo são do agente, marcadas **[decisão do agente]**.

## 1. Pergunta condicional por resposta

Uma pergunta pode aparecer **só quando outra pergunta do formulário tiver certa resposta** (ex.: "Qual o sistema de
aquecimento?" só se "Terá piscina aquecida?" = Sim).

- **Modelo de dados** (`CampoBriefing.condicao?: { campo: chave; igual: string[] }`, dentro do JSON do modelo; sem migração).
- **Quem pode ser controladora [decisão do agente]:** pergunta de **escolha** (escolha única, lista suspensa, sim/não,
  caixas de marcação) que esteja **antes** da condicional na ordem do formulário (mesma seção ou seção anterior). Texto e
  caixa de ciência não servem (resposta aberta). `igual` lista as opções que **mostram** a pergunta; em caixas de marcação
  basta uma das marcadas estar na lista.
- **Encadeia:** a controladora também pode ser condicional; se ela está oculta (por condição, por disciplina não
  contratada ou ocultada no projeto), a pergunta que depende dela fica oculta.
- **Efeitos de estar oculta:** não é exigida, não conta no status nem no progresso, não aparece no link público. **A resposta
  já dada fica guardada** (não é apagada): se a controladora voltar a mostrar a pergunta, a resposta reaparece.
- **Servidor e tela usam a mesma regra pura** (`aplicarCondicoes`): o envio só grava campo visível, avaliando na ordem com as
  respostas do próprio envio (controladora e dependente podem mudar juntas).
- **Editor:** cada pergunta aberta ganha "Aparece só se…" (controladora e respostas). Ao excluir, mover ou mudar o tipo/as
  opções da controladora, a condição que deixou de valer é **removida do rascunho** (e o salvamento recusa condição inválida).

## 2. Modelo de formulário padrão por cliente

- **[decisão do agente]** `Cliente.modeloBriefingId` (opcional). Ordem de escolha do formulário de um projeto:
  1. o modelo escolhido **no projeto** (o que já existe);
  2. o modelo **do cliente**;
  3. o modelo padrão do sistema;
  4. o formulário embutido.
- **Dinâmico, como o padrão do sistema:** projeto sem escolha própria segue o cliente. Mudar o modelo do cliente recalcula o
  status dos briefings que herdam; as respostas ficam (pergunta de mesma chave aproveita a resposta).
- Onde se escolhe: cartão "Formulário de briefing" na ficha do cliente (`clientes:gerir`). Na aba Inputs do projeto, o
  seletor mostra de onde vem o modelo quando o projeto não escolheu.
- Modelo arquivado continua valendo para quem já o usa; só some da escolha de novos.

## 3. Resposta migra quando se renomeia uma opção

Hoje, renomear a opção "Sim, SPLIT" para "SPLIT" deixa as respostas antigas com o texto velho (que já não existe).

- **[decisão do agente]** O editor lembra **de qual opção salva** cada opção veio (a identidade acompanha reordenar, remover e
  adicionar) e, ao salvar, manda a lista de renomeios `{pergunta, de, para}`. O servidor, **na mesma transação** do salvamento
  do modelo, troca o texto nas respostas gravadas dos briefings que usam aquele modelo (escolha única: troca o valor;
  caixas de marcação: troca na lista e tira repetição). Trocas simultâneas (A↔B) funcionam.
- Pergunta condicional que usava a opção renomeada **acompanha** o novo texto (no editor, a cada letra digitada).
- Só mexe nos briefings que usam **este** modelo (inclusive os que herdam dele pelo padrão ou pelo cliente). Opção
  **removida** não migra (a resposta antiga continua guardada, fora da tela, como hoje).
- O aviso de sucesso diz quantas respostas foram atualizadas.

## Fora desta versão

Condição por mais de uma pergunta ou por "diferente de"; pergunta que depende de texto livre; migrar resposta quando se troca
uma opção por outra já existente (isso é remoção + escolha); desfazer a migração (a auditoria guarda o modelo anterior).

## Verificação

Testes puros (regras de condição, validação do esquema, operações do editor, migração de respostas, resolução do modelo),
smoke `smoke:formularios-lote4b` no banco de dev (condição no status e no envio, renomeio migrando respostas na
transação, herança do cliente), tela verificada pelo agente (editor com condição e renomeio, ficha do cliente, seletor do
projeto, formulário público), auditoria nível 3.
