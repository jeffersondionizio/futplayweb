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
