# Modelo — Ferramenta de engenharia

Destino: arquivo para a equipe, junto com a planilha `casos-de-teste-modelo.xlsx` preenchida. A equipe transforma
este documento no cálculo, e os casos da planilha viram o teste automático: o sistema só é aceito se bater com os
números do engenheiro.

Serve para ferramenta **nova** e para **mudança** numa existente (veja `05-ferramentas-existentes.md`). Numa
mudança, preencha só o que muda e diga, no item 1, o que fica igual.

---

## 1. Identificação

- Nome da ferramenta: ...
- Nova ou mudança? Se mudança, qual (nome na lista de ferramentas existentes): ...
- Disciplina: Universal / Estrutural / Fundações / Hidrossanitário / Elétrico / Incêndio (PPCI) / Climatização (AVAC)
- Tipo: **Rápida** (cálculo direto) ou **Completa** (dimensionamento com memória e desenho)
- Normas, com edição: ...
- Engenheiro responsável pelo conteúdo (nome, CREA/CAU): ...

## 2. Para que serve

- O que a ferramenta resolve, em duas ou três frases: ...
- Em que fase do projeto se usa (estudo, anteprojeto, executivo): ...
- O que ela **não** faz / quando não usar: ...

## 3. Entradas

Agrupe em blocos (como aparecerão na tela). Uma linha por campo:

| Bloco | Campo | Símbolo | Unidade | Obrigatório? | Valor padrão | Origem do padrão (norma / prática da casa / sem padrão) | Faixa válida | Fora da faixa: recusar ou avisar? |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

Campos que são escolha numa lista (classe do concreto, tipo de solo, método de instalação): liste as opções e o
que cada uma muda no cálculo.

## 4. Tabelas usadas

Para cada tabela: nome, norma, edição, número da tabela. Transcreva os valores que entram na conta.
- Entre dois valores da tabela: interpola ou pega o mais desfavorável? ...
- Valor fora da tabela: recusa, extrapola ou avisa? ...

## 5. Cálculo passo a passo

Na ordem em que se faz. Uma linha por passo:

| Passo | Grandeza | Fórmula | Unidade | Referência (norma, item) | Observação |
|---|---|---|---|---|---|
| 1 | | | | | |

- Arredondamento: o cálculo usa o valor cheio e arredonda só na apresentação? Quantas casas para cada grandeza? ...
- Iterações ou escolhas (ex.: escolher a bitola, o domínio): qual a regra de parada ou de escolha? ...

## 6. Verificações e alertas

| Condição | Tipo (recusa / alerta / "não atende") | Mensagem que aparece para o usuário | Referência |
|---|---|---|---|
| | | | |

## 7. Saídas

- **Na tela**: grandezas, unidade e casas decimais de cada uma: ...
- **Memória de cálculo**: o que aparece além das fórmulas (dados de entrada, hipóteses, tabelas, croqui): ...
- **Desenho DXF** (só ferramenta completa): o que desenha, cotas, textos, escala: ...
- **Exportações**: PDF / Word / Excel / DXF: ...

## 8. Hipóteses e simplificações

Tudo que foi assumido e que um engenheiro revisor precisa saber (vai para a ficha de validação):
- ...

## 9. Casos de teste

Na planilha `casos-de-teste-modelo.xlsx`, um caso por linha. **Os resultados esperados são calculados pelo
engenheiro**, à mão ou na planilha dele, não pelo assistente. Mínimo:

- 1 caso típico (o uso mais comum);
- 1 caso no limite (troca de domínio, borda de tabela, limite de faixa);
- 1 caso que reprova ou gera alerta;
- 1 caso de entrada inválida (o que deve ser recusado).

Para cada resultado, diga a **tolerância** aceitável (ex.: ± 0,01 A, ± 0,5 %).

## 10. Fora do escopo

O que fica para uma versão futura: ...

## 11. Dúvidas em aberto

O que ainda depende de decisão do engenheiro ou de confirmação da equipe: ...

---

## Pronto quando

- [ ] Toda fórmula tem referência e unidade.
- [ ] Todo campo tem unidade, faixa e o que fazer fora dela.
- [ ] Todo valor padrão diz a origem; o que não tem origem fica "sem padrão" (a pessoa digita).
- [ ] As tabelas estão transcritas com edição e número.
- [ ] Os alertas têm o texto exato que o usuário vai ler.
- [ ] A planilha tem pelo menos 4 casos, com resultados calculados pelo engenheiro e tolerância.
- [ ] Está escrito o que a ferramenta não faz.
- [ ] Numa mudança: está claro o que muda e o que fica igual.
