/**
 * Pós-build: um documento próprio para cada rota pública, e o sitemap.
 *
 * O Vite gera um `index.html` só — é o que uma SPA precisa para funcionar, e é
 * também o motivo de todo link do site compartilhado no WhatsApp mostrar o
 * título da home. O Googlebot renderiza JavaScript e chegaria ao título certo,
 * mas os robôs de prévia (WhatsApp, Facebook, LinkedIn, X, Slack) leem o HTML
 * cru e vão embora; e mesmo para o Google, ler o título direto do documento é
 * mais rápido e mais confiável que esperar a fila de renderização.
 *
 * Então aqui cada rota pública ganha `dist/<caminho>/index.html`: o mesmo
 * aplicativo, os mesmos bundles, com o `<head>` já preenchido e um `<noscript>`
 * que descreve a página. O Cloudflare serve o arquivo exato quando existe e cai
 * no `index.html` da raiz quando não existe, então rotas de detalhe continuam
 * funcionando como antes.
 *
 * Roda no `npm run build`, depois do Vite.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOMINIO,
  IMAGEM_SOCIAL,
  PAGINAS,
  PERGUNTAS,
  caminhoNoIdioma,
  descritorSeo,
} from '../src/servicos/seo.ts'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(raiz, 'dist')

const escapar = (texto) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const IDIOMAS = ['pt-BR', 'en']

/** Rótulos do `<noscript>`, que é a única parte do documento sem tradução pronta. */
const ROTULOS = {
  'pt-BR': { atalhos: 'Páginas do FutPlay', instalar: 'Baixar o FutPlay para Android' },
  en: { atalhos: 'FutPlay pages', instalar: 'Get FutPlay for Android' },
}

/**
 * Conteúdo para quem não executa JavaScript.
 *
 * Não é uma cópia da página — é o resumo que justifica o resultado na busca: um
 * `h1`, a descrição e os links para as outras rotas públicas, que é o que
 * garante que o rastreador saia daqui para o resto do site mesmo sem renderizar.
 */
const noscript = (descritor, idioma) => {
  const atalhos = PAGINAS.filter((p) => p.chave !== 'inicio')
    .map((p) => `<li><a href="${p.caminho[idioma]}">${escapar(p.titulo[idioma].split(' | ')[0])}</a></li>`)
    .join('')

  const faq = descritor.canonical === `${DOMINIO}${caminhoNoIdioma('inicio', idioma)}`
    ? `<section><h2>${idioma === 'en' ? 'Frequently asked questions' : 'Perguntas frequentes'}</h2>${PERGUNTAS[idioma]
        .map((p) => `<h3>${escapar(p.pergunta)}</h3><p>${escapar(p.resposta)}</p>`)
        .join('')}</section>`
    : ''

  return `<noscript><main><h1>${escapar(descritor.title)}</h1><p>${escapar(descritor.description)}</p>`
    + `<nav aria-label="${ROTULOS[idioma].atalhos}"><ul>${atalhos}</ul></nav>${faq}</main></noscript>`
}

/** As tags de `<head>` que dependem da rota; o resto do documento vem do Vite. */
const cabecalho = (descritor, idioma) => {
  const alternativas = Object.entries(descritor.alternativas)
    .map(([lang, url]) => `    <link rel="alternate" hreflang="${lang}" href="${url}" />`)
    .join('\n')

  const schema = descritor.jsonLd
    .map((bloco) => `    <script type="application/ld+json">${JSON.stringify(bloco)}</script>`)
    .join('\n')

  return [
    `    <title>${escapar(descritor.title)}</title>`,
    `    <meta name="description" content="${escapar(descritor.description)}" />`,
    `    <meta name="robots" content="${descritor.indexavel ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow'}" />`,
    `    <link rel="canonical" href="${descritor.canonical}" />`,
    alternativas,
    '    <meta property="og:type" content="website" />',
    '    <meta property="og:site_name" content="FutPlay" />',
    `    <meta property="og:locale" content="${idioma === 'en' ? 'en_US' : 'pt_BR'}" />`,
    `    <meta property="og:locale:alternate" content="${idioma === 'en' ? 'pt_BR' : 'en_US'}" />`,
    `    <meta property="og:title" content="${escapar(descritor.title)}" />`,
    `    <meta property="og:description" content="${escapar(descritor.description)}" />`,
    `    <meta property="og:url" content="${descritor.canonical}" />`,
    `    <meta property="og:image" content="${IMAGEM_SOCIAL}" />`,
    '    <meta property="og:image:width" content="1200" />',
    '    <meta property="og:image:height" content="630" />',
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${escapar(descritor.title)}" />`,
    `    <meta name="twitter:description" content="${escapar(descritor.description)}" />`,
    `    <meta name="twitter:image" content="${IMAGEM_SOCIAL}" />`,
    schema,
  ].filter(Boolean).join('\n')
}

/**
 * Troca no documento do Vite tudo que é específico de rota.
 *
 * Os marcadores existem no `index.html` de origem justamente para isto: sem
 * eles, a substituição dependeria de reconhecer tags soltas no meio do `<head>`
 * e quebraria calado na primeira vez que alguém mexesse na ordem.
 */
const documento = (modelo, descritor, idioma) =>
  modelo
    .replace(/<html lang="[^"]*"/, `<html lang="${idioma}"`)
    .replace(
      /<!-- seo:inicio -->[\s\S]*?<!-- seo:fim -->/,
      `<!-- seo:inicio -->\n${cabecalho(descritor, idioma)}\n    <!-- seo:fim -->`,
    )
    .replace(/<noscript>[\s\S]*?<\/noscript>/, noscript(descritor, idioma))

const modelo = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')

if (!modelo.includes('<!-- seo:inicio -->')) {
  throw new Error('index.html perdeu os marcadores <!-- seo:inicio --> / <!-- seo:fim -->')
}

const gravados = []

for (const pagina of PAGINAS) {
  for (const idioma of IDIOMAS) {
    const caminho = pagina.caminho[idioma]
    const descritor = descritorSeo(caminho)
    // `sorteio.html`, e não `sorteio/index.html`: com o diretório, o Cloudflare
    // responde 307 de `/sorteio` para `/sorteio/`, e aí todo link do site e
    // todo canônico — que não levam barra final — ganhariam um salto de
    // redirecionamento antes de chegar na página.
    const destino = caminho === '/'
      ? path.join(dist, 'index.html')
      : path.join(dist, `${caminho.slice(1)}.html`)

    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, documento(modelo, descritor, idioma))
    gravados.push(caminho)
  }
}

/**
 * Sitemap com as duas versões de cada página.
 *
 * Cada `<url>` lista os dois idiomas em `xhtml:link`, que é como o Google
 * descobre que `/sorteio` e `/en/team-generator` são a mesma página em línguas
 * diferentes em vez de conteúdo duplicado. Só entram rotas públicas e estáveis:
 * pelada e campeonato são registros de usuário, mudam toda semana e não têm
 * valor de busca próprio.
 */
const hoje = new Date().toISOString().slice(0, 10)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGINAS.flatMap((pagina) =>
  IDIOMAS.map((idioma) => {
    const alternativas = IDIOMAS.map(
      (outro) => `    <xhtml:link rel="alternate" hreflang="${outro}" href="${DOMINIO}${pagina.caminho[outro]}" />`,
    ).join('\n')
    return `  <url>
    <loc>${DOMINIO}${pagina.caminho[idioma]}</loc>
${alternativas}
    <xhtml:link rel="alternate" hreflang="x-default" href="${DOMINIO}${pagina.caminho['pt-BR']}" />
    <lastmod>${hoje}</lastmod>
    <changefreq>${pagina.frequencia}</changefreq>
    <priority>${pagina.prioridade}</priority>
  </url>`
  }),
).join('\n')}
</urlset>
`

fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap)

console.log(`SEO: ${gravados.length} documentos pré-gerados e sitemap com ${PAGINAS.length * IDIOMAS.length} URLs`)
console.log(gravados.map((c) => `  ${c}`).join('\n'))
