<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type Clube } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'

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
    if (cidade.value.trim()) lista.value = await api.clubesPorCidade(cidade.value.trim())
    else lista.value = sessao.autenticado ? await api.meusClubes() : []
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
onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <h1 class="mb-6 text-3xl font-extrabold">{{ t('clubes.titulo') }}</h1>

    <form class="mb-6 flex flex-wrap gap-2" @submit.prevent="carregar">
      <input v-model="cidade" class="campo max-w-xs" :placeholder="t('clubes.buscar')" />
      <button type="submit" class="botao-primario">{{ t('comum.buscar') }}</button>
      <button v-if="cidade" type="button" class="botao-secundario" @click="cidade = ''; carregar()">{{ t('comum.limpar') }}</button>
    </form>

    <Estado :carregando="carregando" :erro="erro" :vazio="!lista.length"
            :texto-vazio="t('clubes.vazio')" @recarregar="carregar">
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="c in lista" :key="c.id" class="painel p-5">
          <div class="flex items-start gap-3">
            <Foto pasta="clube" :id="c.id" :nome="c.nome" classe="h-12 w-12" />
            <div class="min-w-0">
              <h2 class="truncate font-bold">{{ c.nome }}</h2>
              <p class="truncate text-sm text-[var(--color-tinta-fraca)]">
                {{ [c.cidade, c.estado].filter(Boolean).join(' · ') || t('comum.naoInformado') }}
              </p>
            </div>
          </div>
          <p class="mt-3 text-sm text-[var(--color-tinta-suave)]">
            {{ c.total_membros ?? '0' }} {{ t('clubes.membros') }}
          </p>
          <button v-if="sessao.autenticado && !c.meu_papel" type="button" class="botao-secundario mt-4 w-full"
                  :disabled="pedidos[c.id]" @click="entrar(c)">
            {{ pedidos[c.id] ? t('peladas.pedidoEnviado') : t('clubes.entrar') }}
          </button>
        </li>
      </ul>
    </Estado>
  </section>
</template>
