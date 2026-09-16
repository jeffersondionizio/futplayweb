# Central do campeonato

Escopo derivado do pedido: classificação inspirada na organização do ge, próximos jogos, artilharia e estatísticas, com suporte móvel.

## Evidências

- RED: `node --experimental-strip-types --test tests/campeonato.test.mjs` falhou porque o módulo de estatísticas ainda não existia. Checkpoint `7a16982`.
- GREEN: os seis testes passaram após implementar o módulo. Checkpoint `8af0525`.
- `npm test`: verifica placares válidos, zero a zero, exclusão de partidas não encerradas, homônimos, deduplicação de eventos, empates de ranking, últimos cinco resultados, fases/rodadas e preservação da classificação oficial.
- Cobertura final do módulo de cálculos: 100% das linhas, 92,98% dos ramos, 100% das funções. A cobertura não representa toda a aplicação Vue.
- `npm run test:e2e`: passou no Chromium, verificando classificação, artilharia, rodada, filtro por clube, estatísticas, navegação por teclado, recuperação de erro, campeonato vazio e inglês.
- Capturas de desktop (1440px) e celular (390px) em `test-results/`; revisadas visualmente. Teste garante ausência de overflow horizontal na página; tabela tem rolagem independente.
- `npm run build`: TypeScript e build de produção passaram.
- `npm audit`: nenhuma vulnerabilidade após instalar o Playwright.

## Contrato e limites

`GET /campeonatos/{id}/eventos` foi confirmado em `ServicoApiCampeonato.kt` do Android. Campos dos eventos vêm de `EventoJogo`; tipos utilizados: GOL, ASSISTENCIA, AMARELO e VERMELHO. Rankings incluem apenas eventos de jogos finalizados com placar válido; gols contra não contam como gols do jogador.

`GET /campeonatos/{id}/participantes` retorna classificação calculada no backend, com confronto direto e fair play. A interface preserva sua ordem, separa grupos e exclui inscrições pendentes. Não aplica zonas de classificação/rebaixamento inventadas.

O teste de navegador intercepta Firebase e API somente no navegador de teste, sem escrever dados reais. Não valida login Google real, permissões ou disponibilidade dos endpoints na AWS. Nenhuma alteração ou implantação na AWS foi necessária ou executada. A interface mostra erro recuperável se a busca de eventos falhar.

Execução: `npm test`, `npm run test:e2e`, `npm run build`. O E2E inicia Vite na porta 5176 e requer Chromium instalado pelo Playwright (`npx playwright install chromium`). Não há dados de demonstração no bundle de produção.

## Paleta global

Por solicitação posterior, o tema global adotou as cores verificadas no HTML de https://ge.globo.com/futebol/brasileirao-serie-a/: #06AA48 no cabeçalho e destaques, #008040 em botões/links, branco no fundo e cinzas neutros. Rodapé, favicon e theme-color foram atualizados. Build e E2E passaram novamente após a alteração; a marca continua FutPlay.
