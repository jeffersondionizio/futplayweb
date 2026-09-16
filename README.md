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

## Configuração do Firebase

As chaves em `src/servicos/configuracao.ts` são públicas por natureza: a
`apiKey` identifica o projeto, não autoriza nada. Quem autoriza é a lista de
domínios permitidos no console do Firebase — é lá que
`futplay.bibiprogramadortop.win` precisa estar, senão o login falha com
`auth/unauthorized-domain`.
