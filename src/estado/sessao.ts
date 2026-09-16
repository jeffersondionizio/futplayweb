/**
 * Sessão do usuário: conta do Firebase + perfil de jogador vindo da API.
 *
 * O perfil não é criado aqui. `POST /auth/sessao` cria na primeira entrada e
 * devolve o existente nas seguintes — é o mesmo caminho que o app Android usa,
 * e por isso quem já joga encontra tudo pronto no primeiro acesso ao site.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type Jogador } from '../servicos/api'
import { aguardarSessao, entrarComGoogle, sair as sairDoFirebase, auth } from '../servicos/firebase'

export const usarSessao = defineStore('sessao', () => {
  const jogador = ref<Jogador | null>(null)
  const carregando = ref(true)
  const entrando = ref(false)
  const erro = ref<string | null>(null)
  /** Verdadeiro quando o perfil acabou de ser criado e ainda está sem dados. */
  const precisaCompletar = ref(false)

  const autenticado = computed(() => jogador.value !== null)

  /**
   * Só quem acabou de ser criado passa pelo cadastro obrigatório.
   *
   * Antes isto exigia posição, idade e peso preenchidos, e prendia na tela de
   * cadastro quem já joga há tempo mas nunca preencheu um desses campos no app
   * — a conta existia, com nome e overall, e ainda assim nenhuma tela abria.
   * Quem quiser completar depois faz em Minha conta.
   */
  const perfilIncompleto = (j: Jogador) => !j.nome?.trim()

  async function restaurar() {
    carregando.value = true
    erro.value = null
    try {
      const usuario = await aguardarSessao()
      if (!usuario) {
        jogador.value = null
        return
      }
      const r = await api.sessao()
      jogador.value = r.jogador
      precisaCompletar.value = Boolean(r.novo_cadastro) || perfilIncompleto(r.jogador)
    } catch (e) {
      erro.value = (e as Error).message
      jogador.value = null
    } finally {
      carregando.value = false
    }
  }

  async function entrar() {
    entrando.value = true
    erro.value = null
    try {
      await entrarComGoogle()
      await restaurar()
    } catch (e) {
      erro.value = (e as Error).message
    } finally {
      entrando.value = false
    }
  }

  async function sair() {
    await sairDoFirebase()
    jogador.value = null
    precisaCompletar.value = false
  }

  async function atualizar(campos: Record<string, unknown>) {
    const id = auth.currentUser?.uid
    if (!id) return
    await api.atualizarPerfil(id, campos)
    jogador.value = await api.perfil(id)
    precisaCompletar.value = perfilIncompleto(jogador.value)
  }

  return {
    jogador, carregando, entrando, erro, autenticado, precisaCompletar,
    restaurar, entrar, sair, atualizar,
  }
})
