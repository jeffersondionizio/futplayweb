/**
 * Rotas do site.
 *
 * As telas ficam em chunks separados (import dinâmico) para que a landing page,
 * que é o que carrega para quem chega pelo Google, não traga junto o código de
 * campeonato e de chat.
 *
 * Cada rota existe em dois endereços: o português, que é o canônico do site, e
 * o inglês sob `/en`, gerado por `caminhoTraduzido` a partir do mesmo caminho.
 * Sem endereços separados o inglês era invisível para busca — uma URL só pode
 * ser indexada em um idioma, e a tradução vivia no `localStorage`.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { usarSessao } from '../estado/sessao'
import { aplicarSeo, caminhoTraduzido, idiomaDoCaminho } from '../servicos/seo'
import { definirIdioma, idiomaSalvo } from '../servicos/idioma'

const rotas: RouteRecordRaw[] = [
  { path: '/', name: 'inicio', component: () => import('../paginas/Inicio.vue') },
  { path: '/entrar', name: 'entrar', component: () => import('../paginas/Entrar.vue') },
  {
    path: '/cadastro',
    name: 'cadastro',
    component: () => import('../paginas/Cadastro.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/peladas', name: 'peladas', component: () => import('../paginas/Peladas.vue') },
  {
    path: '/peladas/nova',
    name: 'criar-pelada',
    component: () => import('../paginas/CriarPelada.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/peladas/:id', name: 'pelada', component: () => import('../paginas/Pelada.vue') },
  {
    path: '/agenda',
    name: 'agenda',
    component: () => import('../paginas/Agenda.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/sorteio', name: 'sorteio', component: () => import('../paginas/Sorteio.vue') },
  { path: '/campeonatos', name: 'campeonatos', component: () => import('../paginas/Campeonatos.vue') },
  {
    path: '/campeonatos/novo',
    name: 'criar-campeonato',
    component: () => import('../paginas/CriarCampeonato.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/campeonatos/:id', name: 'campeonato', component: () => import('../paginas/Campeonato.vue') },
  { path: '/amistosos', name: 'amistosos', component: () => import('../paginas/Amistosos.vue') },
  {
    path: '/amistosos/novo',
    name: 'criar-amistoso',
    component: () => import('../paginas/CriarAmistoso.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/clubes', name: 'clubes', component: () => import('../paginas/Clubes.vue') },
  // Perfil de atleta e leitura aberta: /publico/jogador/{id} responde sem token.
  { path: '/jogador/:id', name: 'jogador', component: () => import('../paginas/Jogador.vue') },
  {
    path: '/conta',
    name: 'conta',
    component: () => import('../paginas/Conta.vue'),
    meta: { exigeSessao: true },
  },
]

/**
 * O endereço em inglês é uma rota própria, não um `alias`.
 *
 * `alias` parecia o caminho curto e não é: o roteador trata o alias e o caminho
 * original como o mesmo lugar, então sair de `/campeonatos` para
 * `/en/tournaments` era recusado como "navegação redundante" — a URL não mudava
 * e só o `<head>` trocava de idioma. Como registro separado, são dois lugares
 * distintos, que é exatamente o que precisam ser para o Google também.
 */
const emIngles = (rota: RouteRecordRaw): RouteRecordRaw => ({
  ...rota,
  path: caminhoTraduzido(rota.path, 'en'),
  name: `en-${String(rota.name)}`,
})

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...rotas,
    ...rotas.map(emIngles),
    { path: '/:qualquer(.*)*', name: 'nao-encontrado', component: () => import('../paginas/NaoEncontrado.vue') },
  ],
  scrollBehavior: (_para, _de, salvo) => salvo ?? { top: 0 },
})

/**
 * O endereço manda no idioma.
 *
 * `/en/tournaments` é inglês para qualquer visitante, inclusive o rastreador,
 * que não tem `localStorage`. A preferência salva só decide para onde vai quem
 * abre o site pela raiz — e aí é um redirecionamento único, na primeira
 * navegação, para que a tela e a URL nunca contem histórias diferentes.
 */
router.beforeEach((para, de) => {
  const idiomaDaUrl = idiomaDoCaminho(para.path)
  const primeiraNavegacao = de.matched.length === 0

  if (primeiraNavegacao && idiomaDaUrl === 'pt-BR' && idiomaSalvo() === 'en') {
    const destino = caminhoTraduzido(para.path, 'en')
    if (destino !== para.path) return { path: destino, query: para.query, hash: para.hash }
  }

  definirIdioma(idiomaDaUrl, { persistir: false })
  return true
})

/**
 * Só o que age exige sessão.
 *
 * Ler pelada, campeonato, amistoso e clube é aberto — quem chega pelo Google vê
 * a página inteira sem conta. O login entra na hora de participar, criar ou
 * conversar, e aí cada tela pede por si, com o destino guardado para voltar.
 */
router.beforeEach(async (para) => {
  if (!para.meta.exigeSessao) return true

  const sessao = usarSessao()
  const idioma = idiomaDoCaminho(para.path)
  // Numa entrada direta pela URL a sessão ainda não foi restaurada; sem esperar,
  // o usuário logado seria mandado para a tela de login.
  if (sessao.carregando) await sessao.restaurar()
  // O destino do login segue o idioma da URL de origem: mandar quem navegava em
  // `/en` para `/entrar` trocaria a língua no meio do fluxo.
  if (!sessao.autenticado) {
    return { path: caminhoTraduzido('/entrar', idioma), query: { destino: para.fullPath } }
  }

  // Perfil recém-criado passa pelo cadastro antes de qualquer outra tela.
  if (sessao.precisaCompletar && para.name !== 'cadastro' && para.name !== 'en-cadastro') {
    return { path: caminhoTraduzido('/cadastro', idioma) }
  }
  return true
})

/**
 * O `<head>` só acompanha navegação que aconteceu.
 *
 * O `afterEach` também roda quando a navegação falha, e aí `para` é o destino
 * que o visitante não alcançou: aplicar o SEO nesse caso deixaria o título de
 * uma página na URL de outra.
 */
router.afterEach((para, _de, falha) => {
  if (!falha) aplicarSeo(para.path)
})
