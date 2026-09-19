/**
 * Catálogo de SEO do site — a mesma fonte para o navegador e para o build.
 *
 * O site é uma SPA: o servidor entrega um HTML só e o Vue troca a tela depois.
 * Para busca isso tem duas consequências, e as duas são resolvidas aqui.
 *
 * 1. O Googlebot renderiza JavaScript, mas os robôs de link (WhatsApp,
 *    Facebook, LinkedIn, X) não renderizam nada. Sem metadados já no documento,
 *    todo link compartilhado do site mostrava o título da home. Por isso o
 *    catálogo abaixo é lido também por `scripts/gerar-seo.mjs`, que grava um
 *    `index.html` próprio para cada rota pública dentro de `dist/`.
 *
 * 2. Português e inglês precisam de endereços diferentes. Antes o idioma vivia
 *    só no `localStorage`, então existia uma única URL para os dois — e uma URL
 *    só pode ser indexada em um idioma. Agora o inglês mora em `/en/...`, com
 *    slug em inglês, e as duas versões se apontam por `hreflang`.
 */

export type Idioma = 'pt-BR' | 'en'

export const IDIOMA_PADRAO: Idioma = 'pt-BR'

export const DOMINIO = 'https://futplay.bibiprogramadortop.win'

/** Imagem de compartilhamento: 1200x630, o formato que Facebook e X recortam sem cortar o texto. */
export const IMAGEM_SOCIAL = `${DOMINIO}/og-futplay.png`

export type SeoPagina = { title: string, description: string }

type Pagina = {
  /** Nome da rota no Vue Router. */
  chave: string
  caminho: Record<Idioma, string>
  titulo: Record<Idioma, string>
  descricao: Record<Idioma, string>
  /** Trilha exibida no BreadcrumbList; a home não tem. */
  trilha?: Record<Idioma, string>
  prioridade: string
  frequencia: string
}

/**
 * As seis rotas públicas, nos dois idiomas.
 *
 * O slug em inglês não é tradução literal do português: `/en/team-generator`
 * responde a "football team generator", que é como se procura isso em inglês —
 * "draw" sozinho traz sorteio de loteria.
 */
export const PAGINAS: Pagina[] = [
  {
    chave: 'inicio',
    caminho: { 'pt-BR': '/', en: '/en' },
    titulo: {
      'pt-BR': 'FutPlay: App para Organizar Pelada, Times e Campeonatos',
      en: 'FutPlay: Pickup Soccer App to Organize Games, Teams and Tournaments',
    },
    descricao: {
      'pt-BR': 'Organize peladas, sorteie times equilibrados, marque amistosos e acompanhe campeonatos de futebol amador no FutPlay. Grátis, no site e no app.',
      en: 'Organize pickup soccer games, draw balanced teams, schedule friendlies and follow amateur football tournaments with FutPlay. Free on web and Android.',
    },
    prioridade: '1.0',
    frequencia: 'weekly',
  },
  {
    chave: 'sorteio',
    caminho: { 'pt-BR': '/sorteio', en: '/en/team-generator' },
    titulo: {
      'pt-BR': 'Sorteador de Times de Futebol Grátis | FutPlay',
      en: 'Free Random Soccer Team Generator | FutPlay',
    },
    descricao: {
      'pt-BR': 'Sorteie times de futebol automaticamente. Cole os jogadores, defina o tamanho das equipes e compartilhe o resultado da sua pelada.',
      en: 'Generate random soccer teams in seconds. Paste your player list, set the team size and share the balanced line-ups with your group.',
    },
    trilha: { 'pt-BR': 'Sorteio de times', en: 'Team generator' },
    prioridade: '0.9',
    frequencia: 'monthly',
  },
  {
    chave: 'peladas',
    caminho: { 'pt-BR': '/peladas', en: '/en/pickup-games' },
    titulo: {
      'pt-BR': 'Peladas de Futebol Perto de Você: Como Organizar | FutPlay',
      en: 'Pickup Soccer Games Near You: Find and Organize | FutPlay',
    },
    descricao: {
      'pt-BR': 'Encontre peladas de futebol na sua cidade, confirme presença, acompanhe as vagas e organize o grupo inteiro em um só lugar.',
      en: 'Find pickup soccer games in your city, confirm attendance, track open spots and keep the whole group organized in one place.',
    },
    trilha: { 'pt-BR': 'Peladas', en: 'Pickup games' },
    prioridade: '0.9',
    frequencia: 'daily',
  },
  {
    chave: 'campeonatos',
    caminho: { 'pt-BR': '/campeonatos', en: '/en/tournaments' },
    titulo: {
      'pt-BR': 'Gerenciador de Campeonatos de Futebol Amador | FutPlay',
      en: 'Amateur Football Tournament Manager and Bracket Maker | FutPlay',
    },
    descricao: {
      'pt-BR': 'Crie campeonatos de futebol amador com grupos e mata-mata. Tabela, jogos, artilharia e classificação atualizados a cada rodada.',
      en: 'Run amateur football tournaments with group stages and knockout brackets. Standings, fixtures, top scorers and results updated every round.',
    },
    trilha: { 'pt-BR': 'Campeonatos', en: 'Tournaments' },
    prioridade: '0.9',
    frequencia: 'daily',
  },
  {
    chave: 'amistosos',
    caminho: { 'pt-BR': '/amistosos', en: '/en/friendlies' },
    titulo: {
      'pt-BR': 'Organizador de Amistosos de Futebol entre Times | FutPlay',
      en: 'Schedule Football Friendlies Between Clubs | FutPlay',
    },
    descricao: {
      'pt-BR': 'Marque amistosos de futebol entre clubes amadores: desafie um time direto ou publique um desafio aberto e espere quem topar.',
      en: 'Schedule football friendlies between amateur clubs: challenge a team directly or post an open challenge and wait for takers.',
    },
    trilha: { 'pt-BR': 'Amistosos', en: 'Friendlies' },
    prioridade: '0.8',
    frequencia: 'daily',
  },
  {
    chave: 'clubes',
    caminho: { 'pt-BR': '/clubes', en: '/en/clubs' },
    titulo: {
      'pt-BR': 'Clubes de Futebol Amador na Sua Cidade | FutPlay',
      en: 'Amateur Football Clubs in Your City | FutPlay',
    },
    descricao: {
      'pt-BR': 'Conheça clubes de futebol amador, peça para entrar e organize jogadores, peladas, amistosos e campeonatos no FutPlay.',
      en: 'Discover amateur football clubs, ask to join and organize players, pickup games, friendlies and tournaments with FutPlay.',
    },
    trilha: { 'pt-BR': 'Clubes', en: 'Clubs' },
    prioridade: '0.8',
    frequencia: 'daily',
  },
]

/**
 * Perguntas da home, nos dois idiomas.
 *
 * Ficam aqui, e não no `idioma.ts`, porque o mesmo texto tem dois destinos que
 * precisam bater: a seção visível da home e o `FAQPage` do structured data. O
 * Google descarta — e pode penalizar — FAQ marcado que não aparece na página,
 * então duas cópias em arquivos diferentes seria uma divergência esperando
 * acontecer.
 */
export const PERGUNTAS: Record<Idioma, { pergunta: string, resposta: string }[]> = {
  'pt-BR': [
    {
      pergunta: 'Como sortear times de futebol equilibrados?',
      resposta: 'Abra o sorteador, cole a lista de jogadores e escolha quantos por time. O FutPlay distribui as equipes considerando o overall de cada um, separa os reservas e mostra as cores dos coletes — pronto para mandar no grupo.',
    },
    {
      pergunta: 'O FutPlay é grátis?',
      resposta: 'Sim. Organizar pelada, sortear times, criar campeonato e marcar amistoso não custam nada, no site e no aplicativo Android.',
    },
    {
      pergunta: 'Preciso baixar o aplicativo para usar?',
      resposta: 'Não. O site funciona no navegador do celular e do computador, com a mesma conta do aplicativo. Ler pelada, campeonato, clube e amistoso é aberto até sem conta.',
    },
    {
      pergunta: 'Como organizar um campeonato de futebol amador?',
      resposta: 'Crie o campeonato, defina o formato (pontos corridos, grupos ou mata-mata), abra as inscrições para os clubes e o FutPlay gera a tabela inteira. Classificação, jogos e artilharia se atualizam a cada resultado lançado.',
    },
    {
      pergunta: 'Como encontro peladas perto de mim?',
      resposta: 'Busque pela sua cidade na página de peladas. Você vê horário, local, valor e vagas de cada grupo, e pede para entrar direto por ali.',
    },
    {
      pergunta: 'Quantos jogadores o sorteio aceita?',
      resposta: 'Qualquer número. Dá para montar times de 3 a 11 jogadores, e quem sobra entra automaticamente na lista de reservas, na ordem do sorteio.',
    },
  ],
  en: [
    {
      pergunta: 'How do I generate balanced soccer teams?',
      resposta: 'Open the team generator, paste your player list and choose how many per side. FutPlay spreads the squads by overall rating, sets the substitutes apart and assigns bib colours — ready to paste into the group chat.',
    },
    {
      pergunta: 'Is FutPlay free?',
      resposta: 'Yes. Organizing pickup games, generating teams, running tournaments and scheduling friendlies cost nothing, both on the web and in the Android app.',
    },
    {
      pergunta: 'Do I need the app to use FutPlay?',
      resposta: 'No. The site works in any phone or desktop browser with the same account as the app. Reading a game, tournament, club or friendly is open even without an account.',
    },
    {
      pergunta: 'How do I run an amateur football tournament?',
      resposta: 'Create the tournament, pick the format (league, group stage or knockout), open registration to clubs and FutPlay builds the whole bracket. Standings, fixtures and top scorers update with every result you enter.',
    },
    {
      pergunta: 'How do I find pickup soccer games near me?',
      resposta: 'Search your city on the pickup games page. You see the time, venue, fee and open spots for each group, and you can ask to join right there.',
    },
    {
      pergunta: 'How many players does the team generator handle?',
      resposta: 'Any number. You can build sides of 3 to 11 players, and whoever is left over joins the substitute list automatically, in draw order.',
    },
  ],
}

/**
 * Rotas que não entram no índice.
 *
 * São telas de sessão e de escrita: não respondem a nenhuma busca, e indexadas
 * só diluiriam o site em resultados que levam a um formulário de login.
 */
export const PREFIXOS_PRIVADOS = [
  '/entrar',
  '/cadastro',
  '/conta',
  '/agenda',
  '/peladas/nova',
  '/campeonatos/novo',
  '/amistosos/novo',
]

/** Rotas de detalhe: conteúdo real, mas gerado pelo usuário e mutável. */
const FAMILIAS: { prefixo: string, titulo: Record<Idioma, string>, descricao: Record<Idioma, string> }[] = [
  {
    prefixo: '/peladas/',
    titulo: { 'pt-BR': 'Pelada de futebol | FutPlay', en: 'Pickup soccer game | FutPlay' },
    descricao: {
      'pt-BR': 'Detalhes da pelada: horário, local, vagas e jogadores confirmados.',
      en: 'Pickup game details: time, venue, open spots and confirmed players.',
    },
  },
  {
    prefixo: '/campeonatos/',
    titulo: { 'pt-BR': 'Campeonato de futebol amador | FutPlay', en: 'Amateur football tournament | FutPlay' },
    descricao: {
      'pt-BR': 'Tabela, jogos, fases e classificação do campeonato.',
      en: 'Standings, fixtures, stages and results for this tournament.',
    },
  },
  {
    prefixo: '/jogador/',
    titulo: { 'pt-BR': 'Perfil do jogador | FutPlay', en: 'Player profile | FutPlay' },
    descricao: {
      'pt-BR': 'Perfil do atleta no FutPlay: posição, clubes e estatísticas.',
      en: 'Player profile on FutPlay: position, clubs and statistics.',
    },
  },
]

const semBarraFinal = (caminho: string) => (caminho.length > 1 ? caminho.replace(/\/+$/, '') : caminho)

/** Um caminho pertence ao inglês quando é `/en` ou começa por `/en/`. */
export const idiomaDoCaminho = (caminho: string): Idioma =>
  caminho === '/en' || caminho.startsWith('/en/') ? 'en' : 'pt-BR'

export const paginaDoCaminho = (caminho: string): Pagina | null =>
  PAGINAS.find((p) => p.caminho['pt-BR'] === caminho || p.caminho.en === caminho) ?? null

/**
 * Caminho de uma rota conhecida no idioma pedido.
 *
 * É o que mantém a navegação coerente: clicar em "Campeonatos" estando em
 * `/en/team-generator` precisa levar a `/en/tournaments`, não a `/campeonatos`.
 */
export const caminhoNoIdioma = (chave: string, idioma: Idioma, padrao = '/'): string =>
  PAGINAS.find((p) => p.chave === chave)?.caminho[idioma] ?? padrao

/**
 * Slugs estáticos, português -> inglês.
 *
 * Existe porque a tradução não pode parar no primeiro segmento: sem isto,
 * `/peladas/abc` viraria `/en/peladas/abc` e o site em inglês teria a lista em
 * `/en/pickup-games` e o detalhe em `/en/peladas` — dois vocabulários na mesma
 * árvore. O que não está no mapa (um id, por exemplo) passa intacto.
 */
const SEGMENTOS: Record<string, string> = {
  peladas: 'pickup-games',
  campeonatos: 'tournaments',
  amistosos: 'friendlies',
  clubes: 'clubs',
  sorteio: 'team-generator',
  jogador: 'player',
  agenda: 'schedule',
  entrar: 'sign-in',
  cadastro: 'sign-up',
  conta: 'account',
  nova: 'new',
  novo: 'new',
}

const SEGMENTOS_INVERSOS: Record<string, string> = Object.fromEntries(
  Object.entries(SEGMENTOS).map(([pt, en]) => [en, pt]),
)

/** Retira o `/en` e devolve os segmentos do caminho já em português. */
const raizEmPortugues = (caminho: string): string => {
  const ingles = idiomaDoCaminho(caminho)
  const corpo = ingles === 'en' ? caminho.slice(3) || '/' : caminho
  if (corpo === '/') return '/'
  const traduzidos = corpo
    .slice(1)
    .split('/')
    .map((s) => (ingles === 'en' ? SEGMENTOS_INVERSOS[s] ?? s : s))
  return `/${traduzidos.join('/')}`
}

/** O par da página atual no outro idioma, para o seletor e para o hreflang. */
export const caminhoTraduzido = (caminho: string, idioma: Idioma): string => {
  const limpo = semBarraFinal(caminho) || '/'
  const pagina = paginaDoCaminho(limpo)
  if (pagina) return pagina.caminho[idioma]

  const raiz = raizEmPortugues(limpo)
  if (idioma === 'pt-BR') return raiz
  if (raiz === '/') return '/en'
  return `/en/${raiz.slice(1).split('/').map((s) => SEGMENTOS[s] ?? s).join('/')}`
}

export type Descritor = {
  idioma: Idioma
  title: string
  description: string
  canonical: string
  /** `hreflang` -> URL absoluta. Vazio nas páginas que não entram no índice. */
  alternativas: Record<string, string>
  indexavel: boolean
  jsonLd: unknown[]
}

const ehPrivado = (caminho: string) => {
  const raiz = raizEmPortugues(caminho)
  return PREFIXOS_PRIVADOS.some((p) => raiz === p || raiz.startsWith(`${p}/`))
}

/**
 * Tudo que o `<head>` de um caminho precisa dizer.
 *
 * Sempre devolve algo. Antes, caminho fora do catálogo saía cedo e a tela
 * herdava o título da anterior — quem abrisse uma pelada vindo do sorteio via
 * "Sorteador de Times" na aba e no histórico.
 */
export const descritorSeo = (caminho: string): Descritor => {
  const limpo = semBarraFinal(caminho) || '/'
  const idioma = idiomaDoCaminho(limpo)
  const pagina = paginaDoCaminho(limpo)
  const indexavel = !ehPrivado(limpo)
  const canonical = `${DOMINIO}${limpo === '/' ? '/' : limpo}`

  const raiz = raizEmPortugues(limpo)
  const familia = FAMILIAS.find((f) => raiz.startsWith(f.prefixo) && raiz.length > f.prefixo.length)
  const inicio = PAGINAS[0]

  const title = pagina?.titulo[idioma] ?? familia?.titulo[idioma] ?? inicio.titulo[idioma]
  const description = pagina?.descricao[idioma] ?? familia?.descricao[idioma] ?? inicio.descricao[idioma]

  const alternativas: Record<string, string> = {}
  if (indexavel) {
    alternativas['pt-BR'] = `${DOMINIO}${caminhoTraduzido(limpo, 'pt-BR')}`
    alternativas.en = `${DOMINIO}${caminhoTraduzido(limpo, 'en')}`
    // x-default aponta para o português: é o público que o FutPlay atende hoje.
    alternativas['x-default'] = alternativas['pt-BR']
  }

  const jsonLd: unknown[] = [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical,
    inLanguage: idioma,
    isPartOf: { '@type': 'WebSite', name: 'FutPlay', url: DOMINIO },
  }]

  // O FAQPage só vale na home, que é onde as perguntas aparecem para o leitor.
  if (pagina?.chave === 'inicio') {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: idioma,
      mainEntity: PERGUNTAS[idioma].map(({ pergunta, resposta }) => ({
        '@type': 'Question',
        name: pergunta,
        acceptedAnswer: { '@type': 'Answer', text: resposta },
      })),
    })
  }

  if (pagina?.trilha) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'FutPlay', item: `${DOMINIO}${caminhoNoIdioma('inicio', idioma)}` },
        { '@type': 'ListItem', position: 2, name: pagina.trilha[idioma], item: canonical },
      ],
    })
  }

  return { idioma, title, description, canonical, alternativas, indexavel, jsonLd }
}

/** Compatibilidade com o formato antigo, usado pelos testes de intenção de busca. */
export const seoDaRota = (path: string): SeoPagina | null => {
  const limpo = semBarraFinal(path) || '/'
  const pagina = paginaDoCaminho(limpo)
  if (!pagina) return null
  const idioma = idiomaDoCaminho(limpo)
  return { title: pagina.titulo[idioma], description: pagina.descricao[idioma] }
}

/* -------------------------------------------------------------------------- */
/* Aplicação no documento                                                      */
/* -------------------------------------------------------------------------- */

const metaPorNome = (nome: string, conteudo: string) => {
  let elemento = document.head.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`)
  if (!elemento) {
    elemento = document.createElement('meta')
    elemento.name = nome
    document.head.append(elemento)
  }
  elemento.content = conteudo
}

const metaPorPropriedade = (propriedade: string, conteudo: string) => {
  let elemento = document.head.querySelector<HTMLMetaElement>(`meta[property="${propriedade}"]`)
  if (!elemento) {
    elemento = document.createElement('meta')
    elemento.setAttribute('property', propriedade)
    document.head.append(elemento)
  }
  elemento.content = conteudo
}

const linkPorRel = (rel: string, href: string, hreflang?: string) => {
  const seletor = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`
  let elemento = document.head.querySelector<HTMLLinkElement>(seletor)
  if (!elemento) {
    elemento = document.createElement('link')
    elemento.rel = rel
    if (hreflang) elemento.hreflang = hreflang
    document.head.append(elemento)
  }
  elemento.href = href
}

/**
 * Sincroniza o `<head>` com a rota.
 *
 * Roda no `afterEach` do roteador. Para o Googlebot, que renderiza, isto já
 * basta; o HTML pré-gerado no build existe para quem não renderiza.
 */
export const aplicarSeo = (caminho: string) => {
  if (typeof document === 'undefined') return
  const d = descritorSeo(caminho)

  document.title = d.title
  document.documentElement.lang = d.idioma
  metaPorNome('description', d.description)
  metaPorNome('robots', d.indexavel ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow')
  linkPorRel('canonical', d.canonical)

  Object.entries(d.alternativas).forEach(([lang, url]) => linkPorRel('alternate', url, lang))

  metaPorPropriedade('og:title', d.title)
  metaPorPropriedade('og:description', d.description)
  metaPorPropriedade('og:url', d.canonical)
  metaPorPropriedade('og:locale', d.idioma === 'en' ? 'en_US' : 'pt_BR')
  metaPorPropriedade('og:image', IMAGEM_SOCIAL)
  metaPorNome('twitter:title', d.title)
  metaPorNome('twitter:description', d.description)
  metaPorNome('twitter:image', IMAGEM_SOCIAL)

  let schema = document.getElementById('futplay-route-schema') as HTMLScriptElement | null
  if (!schema) {
    schema = document.createElement('script')
    schema.id = 'futplay-route-schema'
    schema.type = 'application/ld+json'
    document.head.append(schema)
  }
  schema.text = JSON.stringify(d.jsonLd.length === 1 ? d.jsonLd[0] : d.jsonLd)
}
