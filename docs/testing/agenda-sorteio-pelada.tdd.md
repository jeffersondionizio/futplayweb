# Evidência TDD — agenda, sorteio e criação de pelada

Fonte: jornadas derivadas nesta execução a partir da inspeção do app Android `CadePelada`; nenhum plano externo foi usado.

## Jornadas

- Como jogador logado, quero ver meus próximos jogos em ordem para não perder uma pelada.
- Como organizador, quero colar uma lista e sortear times equilibrados em quantidade.
- Como organizador, quero publicar uma pelada pública pelo navegador usando o mesmo contrato do aplicativo.

## Evidências

| Garantia | Teste | Tipo | Resultado |
|---|---|---|---|
| Datas explícitas e dias recorrentes em português são aceitos; dados inválidos são recusados | `tests/campeonato.test.mjs` — agenda | Unitário | PASS |
| Compromissos sem horário vão ao fim da agenda | `tests/campeonato.test.mjs` — agenda | Unitário | PASS |
| Lista colada é saneada, sem repetidos, e a sobra é distribuída entre times | `tests/campeonato.test.mjs` — sorteio | Unitário | PASS |
| Homepage, responsividade e central de campeonato seguem navegáveis | `npm run test:e2e` | E2E | PASS (3/3) |

RED: `npm test` falhou com `ERR_MODULE_NOT_FOUND` para os serviços de agenda e sorteio antes da implementação.

GREEN: após implementar os serviços e telas, `npm test` passou com 10/10 testes e 100% de linhas; cobertura global de branches: 93,57%.

Validações complementares: `npm run build` passou; `npm audit --omit=dev` retornou 0 vulnerabilidades; `git diff --check` sem erros.

Limite conhecido: a publicação não envia coordenadas. Diferente do app, o site pede cidade e local digitados, pois não adiciona coleta automática de localização.

## Ajuste posterior — sobra como time normal

Jornada: como organizador, quero que a lotação definida seja um teto rígido e que os jogadores excedentes formem o próximo time numerado.

RED: `npm test` falhou pois 11 jogadores com limite 5 produziam `[6, 5]`.

GREEN: `npm test` passou com 10/10 testes e comprova a distribuição `[5, 5, 1]`, a numeração contínua até o último time e a ausência de times acima do limite. `npm run build` também passou.
