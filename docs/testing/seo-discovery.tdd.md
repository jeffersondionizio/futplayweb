# FutPlay SEO discovery — TDD evidence

## Source and journeys

Derived from the request to make searches for FutPlay show its website.

- As someone searching for a pelada organizer, I can identify FutPlay and its purpose from the first HTML document a crawler receives.
- As a crawler, I can discover public FutPlay routes using `robots.txt` and `sitemap.xml`.

## Evidence

The RED run executed the new checks before implementation: the expected canonical metadata was absent and `public/robots.txt` did not exist.

The GREEN implementation adds a canonical URL, keyword-focused title and description, Open Graph metadata, `SoftwareApplication` JSON-LD, an accessible no-JavaScript fallback, and crawler discovery files. The sitemap covers the public application routes, not individual private or mutable user records.

| # | Guarantee | Test | Result |
|---|---|---|---|
| 1 | The home document identifies FutPlay as an app for peladas, balanced team draws, and amateur championships. | `tests/seo.test.mjs` home test | PASS |
| 2 | Crawlers receive a sitemap and discover the public tool and listing routes. | `tests/seo.test.mjs` crawl test | PASS |

## Validation

- `npm test`: 13 passing tests; 100% lines, 92.81% branches, 100% functions in the included suite.
- `npm run build`: passed (`vue-tsc` and Vite).
- `npx wrangler deploy --dry-run`: passed.

## Known external follow-up

Publishing, Google Search Console ownership verification, sitemap submission, and URL inspection were not performed because they change external state.

## Route-intent expansion

The follow-up SEO run added route-specific title and description guarantees for the public sorteio, peladas and campeonatos pages. The RED run failed because `src/servicos/seo.ts` did not exist; the GREEN run passed all 14 tests, with 92.54% lines and 92.99% branches overall. `npm run build` and `npx wrangler deploy --dry-run` also passed.

## Expansão bilíngue

Origem: pedido de aumentar o engajamento nas buscas do Google em português e em
inglês.

### Jornadas

- Como quem procura em inglês por "random soccer team generator", encontro uma
  página do FutPlay em inglês, com endereço próprio e conteúdo em inglês.
- Como quem compartilha um link do site no WhatsApp, mando uma prévia com o
  título, a descrição e a imagem daquela página — não da home.
- Como organizador, encontro no resultado da busca a resposta para "como sortear
  times de futebol" sem precisar abrir o site.

### O que mudou

| # | Garantia | Teste | Resultado |
|---|---|---|---|
| 1 | Cada página pública existe nos dois idiomas, em endereços distintos e com títulos distintos. | `every public page is reachable in both languages` | PASS |
| 2 | O endereço em inglês usa slug em inglês (`/en/team-generator`), não rótulo traduzido sobre caminho português. | `english routes carry english slugs` | PASS |
| 3 | Trocar de idioma leva à mesma página na outra língua, preservando id de detalhe. | `translating a path keeps the visitor on the same page` | PASS |
| 4 | Toda página pública declara canônico e as duas alternativas `hreflang`, com `x-default` no português. | `each public page declares its canonical and both hreflang alternates` | PASS |
| 5 | Telas de sessão ficam fora do índice, nos dois idiomas, e sem `hreflang`. | `session-only screens stay out of the index` | PASS |
| 6 | Página de detalhe descreve a si mesma em vez de herdar o título da anterior. | `a detail page describes itself` | PASS |
| 7 | O `FAQPage` da home marca exatamente as perguntas exibidas, e só a home o tem. | `the home marks up the same questions it shows the reader` | PASS |
| 8 | Página interna carrega trilha de navegação para a home do seu idioma. | `inner pages carry a breadcrumb trail` | PASS |
| 9 | `robots.txt` bloqueia as rotas de sessão nos dois idiomas. | `crawl files expose the public FutPlay search routes` | PASS |

### Dois defeitos encontrados durante a implementação

**`alias` não separa endereços.** A primeira versão registrou `/en/tournaments`
como `alias` de `/campeonatos`. O roteador trata alias e caminho original como o
mesmo lugar: a navegação foi recusada com `NavigationFailure` tipo 16
("Avoided redundant navigation"), a URL não mudou e, como o `afterEach` roda
também em navegação falha, só o `<head>` trocou de idioma. Corrigido com
registros separados, e o `afterEach` passou a ignorar navegação com falha.

**Cabeçalhos em português nas páginas em inglês.** `Sorteio`, `Peladas` e
`Campeonatos` tinham `h1` e texto de apoio escritos direto no template. Sob
`lang="en"` a página exibia título inglês e corpo português — exatamente a
divergência que derruba a versão traduzida. Todo o texto dessas telas passou ao
i18n.

### Validação

- `npm test`: 23 testes passando.
- `npm run build`: `vue-tsc`, Vite e a geração de SEO passaram; 12 documentos e
  sitemap com 12 URLs.
- `npx wrangler dev`: as 12 rotas públicas respondem 200 com o título correto no
  HTML cru, sem redirecionamento.
- `npx playwright test`: `campeonato.spec.js` passa. `inicio.spec.js` falha nas
  duas larguras por asserção sobre `contador-visitas`, recurso removido no
  commit 993e0ce — falha anterior a esta mudança.

### Pendente fora do repositório

Verificação de propriedade no Search Console, envio do sitemap e inspeção de URL
não foram feitos: mudam estado externo.
