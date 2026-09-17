export type SeoPagina = { title: string, description: string }

const dominio = 'https://futplay.bibiprogramadortop.win'

const paginas: Record<string, SeoPagina> = {
  '/': {
    title: 'FutPlay: App para Organizar Pelada, Times e Campeonatos',
    description: 'Organize peladas, sorteie times equilibrados, marque amistosos e acompanhe campeonatos de futebol amador no FutPlay.',
  },
  '/sorteio': {
    title: 'Sorteador de Times de Futebol Grátis | FutPlay',
    description: 'Sorteie times de futebol automaticamente. Cole os jogadores, defina o tamanho das equipes e compartilhe o resultado da sua pelada.',
  },
  '/peladas': {
    title: 'Como Organizar Peladas de Futebol | FutPlay',
    description: 'Encontre e organize peladas de futebol: confirme jogadores, acompanhe vagas e reúna o grupo em um só lugar.',
  },
  '/campeonatos': {
    title: 'Gerenciador de Campeonatos de Futebol Amador | FutPlay',
    description: 'Crie campeonatos de futebol amador, acompanhe tabela, jogos, fases e classificações com o FutPlay.',
  },
  '/amistosos': {
    title: 'Organizador de Amistosos de Futebol | FutPlay',
    description: 'Encontre, marque e acompanhe amistosos de futebol entre clubes e times amadores.',
  },
  '/clubes': {
    title: 'Clubes de Futebol Amador | FutPlay',
    description: 'Conheça clubes de futebol amador e organize jogadores, peladas, amistosos e campeonatos no FutPlay.',
  },
}

export const seoDaRota = (path: string): SeoPagina | null => paginas[path] ?? null

const meta = (nome: string, conteudo: string) => {
  let elemento = document.head.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`)
  if (!elemento) {
    elemento = document.createElement('meta')
    elemento.name = nome
    document.head.append(elemento)
  }
  elemento.content = conteudo
}

export const aplicarSeo = (path: string) => {
  const seo = seoDaRota(path)
  if (!seo || typeof document === 'undefined') return
  const canonical = `${dominio}${path === '/' ? '/' : path}`
  document.title = seo.title
  meta('description', seo.description)
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.append(link)
  }
  link.href = canonical
  let schema = document.getElementById('futplay-route-schema') as HTMLScriptElement | null
  if (!schema) {
    schema = document.createElement('script')
    schema.id = 'futplay-route-schema'
    schema.type = 'application/ld+json'
    document.head.append(schema)
  }
  schema.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: seo.title, description: seo.description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'FutPlay', url: dominio } })
}
