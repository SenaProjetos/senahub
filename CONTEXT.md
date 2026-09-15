# SenaHub

ERP próprio de um escritório de engenharia BIM. Este arquivo é **só glossário**: o vocabulário
canônico do domínio. Sem decisões (essas ficam em `docs/adr/`), sem detalhe de implementação.

Criado em 2026-09-09 com o cluster de documentação; outros clusters entram conforme os termos
forem resolvidos.

## Documentação

**Seção da documentação**:
Um dos 9 agrupamentos de alto nível do sistema pelos quais a documentação é organizada —
Início e Portal, Projetos, Clientes e Comercial, Financeiro, RH e Ponto, Engenharia, Gestão,
Comunicação, Sistema. Uma seção reúne várias rotas e vários módulos; não corresponde a uma tela nem
a uma pasta de código. Até 2026-09-15 se chamava "setor"; o nome passou para o sentido
organizacional (ver **Setor**). A rota `/guias/[setor]` e o parâmetro de código mantêm o nome antigo
de propósito — renomear quebraria links, e o glossário não obriga a isso.
_Avoid_: setor (neste sentido), área, módulo

**Módulo**:
Uma pasta de domínio em `src/modules/`. Unidade de **código**, não de documentação — vários módulos
cabem numa seção da documentação.
_Avoid_: feature, domínio

**Manual de referência**:
A documentação de consulta pontual, em markdown sob `docs/manual/`, exibida em `/ajuda`. Responde
"o que este campo faz", "qual permissão preciso", "o que significa esta mensagem de erro". Aberta a
todos os perfis, cliente incluso.
_Avoid_: docs, ajuda, help, manual do usuário

**Guia de uso**:
A camada de **formação** de uma seção da documentação, para quem ainda não domina o vocabulário
dela: o que os termos significam, por que o processo existe e como as telas se encadeiam. Uma
página React por seção em `/guias/[setor]`, visível só a colaborador interno.
_Avoid_: guia para iniciantes, guia prático, tutorial, onboarding, treinamento

**Fronteira editorial**:
A regra que separa guia de uso e manual de referência: significado, porquê e encadeamento ficam no
guia; permissões, regras de negócio, definição campo a campo e tabela de erros ficam no manual. O
guia **liga** para o manual, nunca repete.
_Avoid_: escopo da doc, divisão de conteúdo

**Stub**:
O arquivo curto em `docs/manual/<secao>/guia-iniciante.md` que só aponta para o guia de uso. Existe
para o guia continuar achável na busca do `/ajuda`; não cresce, não carrega conteúdo.
_Avoid_: resumo, índice, placeholder

**Deliberação**:
A ata de uma decisão do Conselho Permanente de Documentação, em `docs/manual/deliberacoes/`:
participantes, descobertas, divergências e decisão final. Registra **como** se chegou à decisão.
_Avoid_: ata, reunião, RFC

**ADR**:
O registro de uma decisão arquitetural em `docs/adr/`. Registra **o que** foi decidido e por quê,
não o processo. Numeração `0001-slug.md`. Os arquivos `ADR-00N` sob `docs/manual/decisions/` são a
série legada, anterior a esta convenção, e continuam válidos.
_Avoid_: decisão, RFC, design doc

## Pessoas e acesso

Uma mesma pessoa carrega fatos independentes: como foi contratada, qual papel legado ocupa, que
perfil de acesso recebeu e que cargo exerce. Nenhum deles implica os outros.

**Setor**:
A área da empresa em que a pessoa trabalha — Diretoria, Administrativo, Jurídico, Engenharia, TI.
Vem do vínculo ativo. É endereço, não crachá: não decide telas, jornada nem escopo.
_Avoid_: departamento, área, seção da documentação

**Contratação**:
A forma jurídica pela qual a pessoa trabalha para o escritório — CLT, estágio, PJ, autônomo (RPA)
ou pró-labore. Vem do vínculo ativo e decide a jornada; não decide telas.
_Avoid_: tipo de contrato, regime (quando se quer dizer contratação), papel

**Vínculo**:
Um período de contratação da pessoa com o escritório, com data de início e de fim. A pessoa acumula
vínculos ao longo do tempo; no máximo um está ativo.
_Avoid_: contrato, admissão

**Jornada controlada**:
A condição de quem bate ponto e, pelo mesmo fato, tem espelho, banco de horas, lembrete de ponto,
férias e holerite CLT. Tem jornada controlada quem é contratado CLT ou estágio, qualquer que seja o
cargo.
_Avoid_: "é CLT" (quando se quer dizer jornada controlada), celetista

**Batida**:
O registro de entrada, pausa ou saída de quem tem jornada controlada. É prova de vínculo
empregatício, por isso nunca é aceita de quem não tem jornada controlada.
_Avoid_: ponto (quando se quer dizer um registro só), marcação

**Apontamento de horas**:
O registro de horas por projeto de quem não tem jornada controlada (PJ, freelancer), sem batida,
sem espelho e sem banco de horas. Alimenta o rateio de custo do projeto.
_Avoid_: ponto do PJ, timesheet

**Papel**:
O campo legado que classificava a pessoa numa lista fixa (Administrador, Coordenador,
Administrativo, CLT, Estagiário, Projetista PJ, Freelancer, Cliente, TI). Está sendo esvaziado:
ainda decide o apontamento de horas, mais nada.
_Avoid_: perfil (sem qualificar), role, função

**Perfil de acesso**:
O conjunto configurável de permissões atribuído pessoa a pessoa, que decide quais telas e ações ela
alcança. "Coordenador" é ao mesmo tempo um papel e um perfil de acesso: uma coordenadora contratada
CLT tem papel CLT e perfil de acesso Coordenador.
_Avoid_: perfil (sem qualificar), permissão (quando se quer dizer o conjunto), nível de acesso

**Override de permissão**:
Uma permissão concedida ou negada a uma pessoa específica, por cima do perfil de acesso dela, com
motivo obrigatório. Vence o perfil nos dois sentidos.
_Avoid_: exceção, permissão extra

**Escopo global**:
A permissão de enxergar todos os projetos da empresa, e não só aqueles em que a pessoa é membro ou
responsável. Vem do perfil de acesso ou de um override; não vem do papel. Só enxergar: não autoriza
mexer em nada — isso é **Atuar em disciplina alheia**.
_Avoid_: acesso total (isso é superusuário), ver tudo

**Atuar em disciplina alheia**:
Escrever na disciplina de outra pessoa — enviar e renomear arquivo, editar pendência, diário e
apontamento de coordenação, mudar status. Por padrão só o responsável da disciplina escreve nela;
esta permissão, do perfil de acesso, estende isso a todas.
_Avoid_: perfil global, acesso global (isso é escopo)

**Aprovação da entrega**:
O ato que encerra a disciplina e libera a demanda para o financeiro, que cria o pagamento do
projetista. É distinto de pagar: quem aprova não precisa ver o valor, e só quem enxerga financeiro
o vê ou altera na aprovação. Distinto também de revisar, que é validar arquivo a arquivo.
_Avoid_: validação (quando se quer dizer aprovação da entrega), liberar pagamento

**Superusuário**:
A pessoa que ignora perfil de acesso e overrides e alcança tudo. É uma marca por pessoa, não um
papel nem um perfil.
_Avoid_: admin (quando se quer dizer o bypass), acesso total

**Piso de sócio**:
O acesso de leitura que o sócio recebe além do próprio perfil de acesso, equivalente ao que o
Coordenador lê. É leitura por definição.
_Avoid_: acesso de sócio, perfil sócio
