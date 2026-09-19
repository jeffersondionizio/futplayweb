import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  PAGINAS,
  PERGUNTAS,
  caminhoNoIdioma,
  caminhoTraduzido,
  descritorSeo,
  idiomaDoCaminho,
  seoDaRota,
} from '../src/servicos/seo.ts'

const root = path.resolve(import.meta.dirname, '..')
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

test('home document describes FutPlay for football-organizing searches', () => {
  assert.match(index, /<link rel="canonical" href="https:\/\/futplay\.bibiprogramadortop\.win\/" \/>/)
  assert.match(index, /<meta property="og:title" content="FutPlay: App para Organizar Pelada, Times e Campeonatos" \/>/)
  assert.match(index, /"@type":"SoftwareApplication"/)
  assert.match(index, /app para organizar pelada/)
})

test('crawl files expose the public FutPlay search routes', () => {
  const robots = fs.readFileSync(path.join(root, 'public', 'robots.txt'), 'utf8')
  assert.match(robots, /Sitemap: https:\/\/futplay\.bibiprogramadortop\.win\/sitemap\.xml/)
  // O que exige sessão fica fora do índice: são telas sem resposta de busca.
  ;['/entrar', '/conta', '/agenda', '/en/sign-in'].forEach((rota) => {
    assert.match(robots, new RegExp(`Disallow: ${rota}$`, 'm'))
  })
})

test('public tools have distinct search intent instead of homepage metadata', () => {
  assert.deepEqual(seoDaRota('/sorteio'), {
    title: 'Sorteador de Times de Futebol Grátis | FutPlay',
    description: 'Sorteie times de futebol automaticamente. Cole os jogadores, defina o tamanho das equipes e compartilhe o resultado da sua pelada.',
  })
  assert.equal(seoDaRota('/peladas')?.title, 'Peladas de Futebol Perto de Você: Como Organizar | FutPlay')
  assert.equal(seoDaRota('/campeonatos')?.title, 'Gerenciador de Campeonatos de Futebol Amador | FutPlay')
  assert.equal(seoDaRota('/nao-existe'), null)
})

test('every public page is reachable in both languages under its own address', () => {
  PAGINAS.forEach((pagina) => {
    assert.equal(idiomaDoCaminho(pagina.caminho['pt-BR']), 'pt-BR', pagina.chave)
    assert.equal(idiomaDoCaminho(pagina.caminho.en), 'en', pagina.chave)
    // Endereços distintos: uma URL só pode ser indexada em um idioma.
    assert.notEqual(pagina.caminho['pt-BR'], pagina.caminho.en, pagina.chave)
    assert.notEqual(pagina.titulo['pt-BR'], pagina.titulo.en, pagina.chave)
  })
})

test('english routes carry english slugs, not translated labels on portuguese paths', () => {
  assert.equal(caminhoNoIdioma('sorteio', 'en'), '/en/team-generator')
  assert.equal(caminhoNoIdioma('peladas', 'en'), '/en/pickup-games')
  assert.equal(caminhoNoIdioma('campeonatos', 'en'), '/en/tournaments')
  assert.equal(seoDaRota('/en/team-generator')?.title, 'Free Random Soccer Team Generator | FutPlay')
})

test('translating a path keeps the visitor on the same page in the other language', () => {
  assert.equal(caminhoTraduzido('/campeonatos', 'en'), '/en/tournaments')
  assert.equal(caminhoTraduzido('/en/tournaments', 'pt-BR'), '/campeonatos')
  assert.equal(caminhoTraduzido('/', 'en'), '/en')
  assert.equal(caminhoTraduzido('/en', 'pt-BR'), '/')
  // Rota de detalhe: o id passa intacto e só o segmento conhecido é traduzido.
  assert.equal(caminhoTraduzido('/peladas/abc123', 'en'), '/en/pickup-games/abc123')
  assert.equal(caminhoTraduzido('/en/pickup-games/abc123', 'pt-BR'), '/peladas/abc123')
  assert.equal(caminhoTraduzido('/peladas/nova', 'en'), '/en/pickup-games/new')
})

test('each public page declares its canonical and both hreflang alternates', () => {
  const d = descritorSeo('/en/tournaments')
  assert.equal(d.idioma, 'en')
  assert.equal(d.canonical, 'https://futplay.bibiprogramadortop.win/en/tournaments')
  assert.equal(d.alternativas['pt-BR'], 'https://futplay.bibiprogramadortop.win/campeonatos')
  assert.equal(d.alternativas.en, 'https://futplay.bibiprogramadortop.win/en/tournaments')
  assert.equal(d.alternativas['x-default'], d.alternativas['pt-BR'])
  assert.ok(d.indexavel)
})

test('session-only screens stay out of the index in both languages', () => {
  ;['/entrar', '/conta', '/agenda', '/peladas/nova', '/en/sign-in', '/en/account'].forEach((rota) => {
    const d = descritorSeo(rota)
    assert.equal(d.indexavel, false, rota)
    assert.deepEqual(d.alternativas, {}, rota)
  })
})

test('a detail page describes itself instead of inheriting the previous title', () => {
  const d = descritorSeo('/peladas/abc123')
  assert.equal(d.title, 'Pelada de futebol | FutPlay')
  assert.equal(d.canonical, 'https://futplay.bibiprogramadortop.win/peladas/abc123')
  assert.equal(descritorSeo('/en/tournaments/xyz').title, 'Amateur football tournament | FutPlay')
})

test('the home marks up the same questions it shows the reader', () => {
  const inicio = descritorSeo('/')
  const faq = inicio.jsonLd.find((b) => b['@type'] === 'FAQPage')
  assert.ok(faq, 'home sem FAQPage')
  assert.equal(faq.mainEntity.length, PERGUNTAS['pt-BR'].length)
  assert.equal(faq.mainEntity[0].name, PERGUNTAS['pt-BR'][0].pergunta)
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, PERGUNTAS['pt-BR'][0].resposta)

  // Página interna não finge ter FAQ: marcar resposta invisível é penalidade.
  assert.equal(descritorSeo('/sorteio').jsonLd.some((b) => b['@type'] === 'FAQPage'), false)
})

test('inner pages carry a breadcrumb trail back to the home of their language', () => {
  const trilha = descritorSeo('/en/team-generator').jsonLd.find((b) => b['@type'] === 'BreadcrumbList')
  assert.ok(trilha)
  assert.equal(trilha.itemListElement[0].item, 'https://futplay.bibiprogramadortop.win/en')
  assert.equal(trilha.itemListElement[1].name, 'Team generator')
})

test('both languages answer the same questions', () => {
  assert.equal(PERGUNTAS['pt-BR'].length, PERGUNTAS.en.length)
  PERGUNTAS.en.forEach((p) => {
    assert.ok(p.pergunta.length > 10 && p.resposta.length > 40)
  })
})
