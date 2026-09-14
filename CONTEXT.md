# SenaHub

ERP próprio de um escritório de engenharia BIM. Este arquivo é **só glossário**: o vocabulário
canônico do domínio. Sem decisões (essas ficam em `docs/adr/`), sem detalhe de implementação.

Criado em 2026-09-09 com o cluster de documentação; outros clusters entram conforme os termos
forem resolvidos.

## Documentação

**Setor**:
Um dos 9 agrupamentos de alto nível do sistema pelos quais a documentação é organizada —
Início e Portal, Projetos, Clientes e Comercial, Financeiro, RH e Ponto, Engenharia, Gestão,
Comunicação, Sistema. Um setor reúne várias rotas e vários módulos; não corresponde a uma tela nem
a uma pasta de código.
_Avoid_: área, seção (quando se quer dizer setor), módulo

**Módulo**:
Uma pasta de domínio em `src/modules/`. Unidade de **código**, não de documentação — vários módulos
cabem num setor.
_Avoid_: feature, domínio

**Manual de referência**:
A documentação de consulta pontual, em markdown sob `docs/manual/`, exibida em `/ajuda`. Responde
"o que este campo faz", "qual permissão preciso", "o que significa esta mensagem de erro". Aberta a
todos os perfis, cliente incluso.
_Avoid_: docs, ajuda, help, manual do usuário

**Guia de uso**:
A camada de **formação** de um setor, para quem ainda não domina o vocabulário dele: o que os
termos significam, por que o processo existe e como as telas se encadeiam. Uma página React por
setor em `/guias/[setor]`, visível só a colaborador interno.
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
