# FutPlay Web

Site de peladas e campeonatos. **https://futplay.bibiprogramadortop.win**

Mesma conta do aplicativo Android: quem já joga entra com o Google e encontra
perfil, grupos, clubes e campeonatos prontos.

## Arquitetura

Não existe backend próprio. O navegador fala direto com a API do FutPlay na AWS
— o mesmo gateway que o aplicativo usa.

```
navegador ──┬─ Firebase Auth (Google)  → ID token
            └─ API Gateway zamxi44hx6  → Authorization: Bearer <idToken>
                 └─ Lambdas → DynamoDB
```

Isso só é possível porque o gateway já libera CORS (`*` com `authorization`) e
o autorizador valida token do Firebase. A consequência prática é que **regra de
negócio nova entra no backend uma vez e vale para o site e para o app**.

| Camada | Escolha |
|---|---|
| Framework | Vue 3 + TypeScript |
| Build | Vite |
| Rotas | Vue Router (SPA) |
| Estado | Pinia |
| Estilo | Tailwind v4, tema em `src/estilo/tema.css` |
| Idiomas | vue-i18n — pt-BR padrão, inglês opcional |
| Autenticação | Firebase Web SDK (só login Google) |
| Hospedagem | Cloudflare Workers com assets estáticos |

## Rodar

```bash
npm install
npm run dev          # desenvolvimento
npm run build        # gera dist/
npm run deploy       # build + publica na Cloudflare
```

## Estrutura

```
src/
  servicos/     api.ts (cliente tipado)  firebase.ts  imagens.ts
                clubes.ts  idioma.ts  configuracao.ts
  estado/       sessao.ts (Pinia)
  rotas/        index.ts, com guarda de sessão
  componentes/  Cabecalho, Rodape, Foto, Chat, Etiqueta, Estado, SeletorIdioma
  paginas/      Inicio, Entrar, Cadastro, Peladas, Pelada, Campeonatos,
                Campeonato, CriarCampeonato, Amistosos, CriarAmistoso,
                Clubes, Conta, NaoEncontrado
```

## Dois detalhes que não são óbvios

**Fotos passam por URL assinada.** A rota `GET /imagem/{pasta}/{id}` exige o
cabeçalho `Authorization`, e uma tag `<img>` não manda cabeçalho nenhum — o src
apontado direto para ela devolve 401. `src/servicos/imagens.ts` pede as URLs em
lote por `POST /imagem/urls` e usa o link assinado do S3.

**Listas devolvem array nu.** O backend responde `[...]`, não `{items:[...]}`,
porque é o que as interfaces Retrofit do app declaram. As quatro rotas que de
fato têm envelope (histórico, inbox, seguidores, mídia) são a exceção.

## SPA na Cloudflare

`wrangler.jsonc` usa `not_found_handling: "single-page-application"`: qualquer
caminho sem arquivo correspondente devolve o `index.html` com 200 e o Vue Router
assume dali. Sem isso, abrir `/peladas` direto pela URL redirecionaria para a
raiz e a rota se perderia.

## Busca e idiomas

O site existe em dois endereços por página: o português, que é o canônico, e o
inglês sob `/en` com slug traduzido — `/sorteio` e `/en/team-generator` são a
mesma página em línguas diferentes, e `hreflang` diz isso ao Google.

Antes o idioma vivia só no `localStorage`, então havia uma URL só para os dois.
Uma URL só pode ser indexada em um idioma: a tradução inteira era invisível para
busca. Hoje o endereço manda — abrir `/en/tournaments` mostra inglês para
qualquer visitante, inclusive o rastreador, que não tem `localStorage`.

| Onde | O quê |
|---|---|
| `src/servicos/seo.ts` | Catálogo: caminho, título, descrição e trilha de cada rota nos dois idiomas, mais as perguntas da home |
| `src/rotas/index.ts` | Cada rota registrada duas vezes — `/campeonatos` e `/en/tournaments` — e o guarda que tira o idioma da URL |
| `scripts/gerar-seo.mjs` | Pós-build: um `.html` por rota pública com o `<head>` já preenchido, e o `sitemap.xml` |
| `scripts/gerar-og.mjs` | Gera `public/og-futplay.png` à mão; o PNG é versionado |

**Por que pré-gerar o HTML.** O Googlebot renderiza JavaScript e chegaria ao
título certo sozinho, mas os robôs de prévia — WhatsApp, Facebook, LinkedIn, X —
leem o HTML cru e vão embora. Com um documento só, todo link do site
compartilhado mostrava o título da home. O build grava `dist/sorteio.html`,
`dist/en/team-generator.html` e assim por diante, com título, descrição,
canônico, `hreflang` e Open Graph próprios.

O arquivo é plano (`sorteio.html`) e não uma pasta (`sorteio/index.html`) porque
o Cloudflare responde 307 de `/sorteio` para `/sorteio/` quando existe a pasta —
e aí todo link interno e todo canônico, que não levam barra final, ganhariam um
salto de redirecionamento.

Rotas de detalhe (`/peladas/{id}`) e telas de sessão não são pré-geradas: caem
no `index.html` e o `aplicarSeo` do roteador corrige o `<head>` no cliente. As
de sessão saem do índice por `robots.txt` e por `<meta name="robots">`.

**`alias` não serve para isto.** Registrar `/en/tournaments` como alias de
`/campeonatos` faz o roteador tratar os dois como o mesmo lugar: trocar de
idioma era recusado como navegação redundante, a URL não mudava e só o `<head>`
trocava de língua. São dois registros separados de propósito.

## Configuração do Firebase

As chaves em `src/servicos/configuracao.ts` são públicas por natureza: a
`apiKey` identifica o projeto, não autoriza nada. Quem autoriza é a lista de
domínios permitidos no console do Firebase — é lá que
`futplay.bibiprogramadortop.win` precisa estar, senão o login falha com
`auth/unauthorized-domain`.
