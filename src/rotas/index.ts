/**
 * Rotas do site.
 *
 * As telas ficam em chunks separados (import dinâmico) para que a landing page,
 * que é o que carrega para quem chega pelo Google, não traga junto o código de
 * campeonato e de chat.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { usarSessao } from '../estado/sessao'

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
    path: '/peladas/:id',
    name: 'pelada',
    component: () => import('../paginas/Pelada.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/campeonatos', name: 'campeonatos', component: () => import('../paginas/Campeonatos.vue') },
  {
    path: '/campeonatos/:id',
    name: 'campeonato',
    component: () => import('../paginas/Campeonato.vue'),
    meta: { exigeSessao: true },
  },
  {
    path: '/amistosos',
    name: 'amistosos',
    component: () => import('../paginas/Amistosos.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/clubes', name: 'clubes', component: () => import('../paginas/Clubes.vue') },
  {
    path: '/conta',
    name: 'conta',
    component: () => import('../paginas/Conta.vue'),
    meta: { exigeSessao: true },
  },
  { path: '/:qualquer(.*)*', name: 'nao-encontrado', component: () => import('../paginas/NaoEncontrado.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes: rotas,
  scrollBehavior: (_para, _de, salvo) => salvo ?? { top: 0 },
})

router.beforeEach(async (para) => {
  if (!para.meta.exigeSessao) return true

  const sessao = usarSessao()
  // Numa entrada direta pela URL a sessão ainda não foi restaurada; sem esperar,
  // o usuário logado seria mandado para a tela de login.
  if (sessao.carregando) await sessao.restaurar()
  if (!sessao.autenticado) return { name: 'entrar', query: { destino: para.fullPath } }

  // Perfil recém-criado passa pelo cadastro antes de qualquer outra tela.
  if (sessao.precisaCompletar && para.name !== 'cadastro') return { name: 'cadastro' }
  return true
})
