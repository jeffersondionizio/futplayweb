<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Clube } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'

const { t } = useI18n()
const sessao = usarSessao()
const cidade = ref('')
const lista = ref<Clube[]>([])
const carregando = ref(false)
const erro = ref<string | null>(null)
const pedidos = ref<Record<string, boolean>>({})

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const busca = cidade.value.trim()
    if (!sessao.autenticado) lista.value = await publico.clubes(busca)
    else if (busca) lista.value = await api.clubesPorCidade(busca)
    else lista.value = await api.meusClubes()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

async function entrar(c: Clube) {
  try { await api.entrarNoClube(c.id); pedidos.value[c.id] = true }
  catch (e) { erro.value = (e as Error).message }
}

/** Afunila o que já veio; a busca por cidade é que decide o conjunto. */
const termo = ref('')
const visiveis = computed(() => {
  const busca = termo.value.trim().toLowerCase()
  if (!busca) return lista.value
  return lista.value.filter((c) =>
    [c.nome, c.cidade, c.estado, c.descricao].some((campo) => campo?.toLowerCase().includes(busca)))
})
onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <header class="capa-lista">
      <h1>{{ t('clubes.titulo') }}</h1>
      <p>{{ t('clubes.chamada') }}</p>
    </header>

    <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" />

    <form class="barra-filtros" @submit.prevent="carregar">
      <input v-model="cidade" class="campo" :placeholder="t('clubes.buscar')" />
      <button type="submit" class="botao-primario">{{ t('comum.buscar') }}</button>
      <button v-if="cidade" type="button" class="botao-secundario" @click="cidade = ''; carregar()">{{ t('comum.limpar') }}</button>
      <input v-model="termo" class="campo" type="search" :placeholder="t('comum.filtrarNaLista')" />
      <span v-if="lista.length" class="contagem-resultado">{{ t('comum.resultados', visiveis.length) }}</span>
    </form>

    <Estado :carregando="carregando" :erro="erro" :vazio="!visiveis.length"
            :texto-vazio="t('clubes.vazio')" @recarregar="carregar">
      <ul class="grade-cartoes">
        <li v-for="c in visiveis" :key="c.id" class="cartao">
          <div class="cartao-topo">
            <Foto pasta="clube" :id="c.id" :nome="c.nome" classe="h-9 w-9" />
            <div class="cartao-identidade">
              <h2 class="cartao-titulo">{{ c.nome }}</h2>
              <p class="cartao-local">
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
                <span class="truncate">{{ [c.cidade, c.estado].filter(Boolean).join(' · ') || t('comum.naoInformado') }}</span>
              </p>
            </div>
          </div>

          <div v-if="c.meu_papel || c.privacidade" class="cartao-selos">
            <span v-if="c.meu_papel" class="selo">{{ c.meu_papel }}</span>
            <span v-if="c.privacidade" class="selo selo-neutro">{{ c.privacidade }}</span>
          </div>

          <!-- A cidade já está no topo; aqui fica o que o topo não cabe. -->
          <p class="cartao-linha">
            <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M16 19v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="8" r="3.2" />
            </svg>
            <span><strong class="text-[var(--color-marca)]">{{ c.total_membros ?? '0' }}</strong> {{ t('clubes.membros') }}</span>
          </p>
          <p v-if="c.descricao" class="cartao-descricao">{{ c.descricao }}</p>

          <div class="cartao-rodape">
            <button v-if="sessao.autenticado && !c.meu_papel" type="button" class="botao-secundario"
                    :disabled="pedidos[c.id]" @click="entrar(c)">
              {{ pedidos[c.id] ? t('peladas.pedidoEnviado') : t('clubes.entrar') }}
            </button>
            <ConviteEntrar v-else-if="!sessao.autenticado" />
            <span v-else class="botao-secundario pointer-events-none opacity-60">{{ t('peladas.jaSouMembro') }}</span>
          </div>
        </li>
      </ul>
    </Estado>
  </section>
</template>
