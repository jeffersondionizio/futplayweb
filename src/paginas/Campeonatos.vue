<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Campeonato } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'
import Etiqueta from '../componentes/Etiqueta.vue'
import Foto from '../componentes/Foto.vue'

const { t } = useI18n()
const sessao = usarSessao()
const aba = ref<'descobrir' | 'meus'>('descobrir')
const lista = ref<Campeonato[]>([])
const carregando = ref(false)
const erro = ref<string | null>(null)

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    if (!sessao.autenticado) { lista.value = await publico.campeonatos(); return }
    lista.value = aba.value === 'meus' ? await api.meusCampeonatos() : await api.todosCampeonatos()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <header class="capa-lista">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{{ t('campeonatos.titulo') }}</h1>
          <p>{{ t('campeonatos.chamada') }}</p>
        </div>
        <RouterLink v-if="sessao.autenticado" :to="{ name: 'criar-campeonato' }" class="botao-primario shrink-0">
          + {{ t('criar.campeonato') }}
        </RouterLink>
      </div>

      <div v-if="sessao.autenticado" class="abas-lista" role="tablist">
        <button
          v-for="opcao in (['descobrir', 'meus'] as const)" :key="opcao" type="button" role="tab"
          class="aba-lista"
          :aria-selected="aba === opcao"
          @click="aba = opcao; carregar()"
        >{{ t(`campeonatos.${opcao}`) }}</button>
      </div>
    </header>

    <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" />

    <Estado :carregando="carregando" :erro="erro" :vazio="!lista.length"
            :texto-vazio="t('campeonatos.vazio')" @recarregar="carregar">
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="c in lista" :key="c.id" class="painel overflow-hidden">
          <RouterLink :to="{ name: 'campeonato', params: { id: c.id } }" class="block p-5">
            <div class="flex items-start gap-3">
              <Foto pasta="competicao" :id="c.id" :nome="c.nome" classe="h-12 w-12" />
              <div class="min-w-0 flex-1">
                <h2 class="truncate font-bold">{{ c.nome }}</h2>
                <p class="truncate text-sm text-[var(--color-tinta-fraca)]">{{ c.cidade || t('comum.naoInformado') }}</p>
              </div>
            </div>
            <div class="mt-4 flex items-center justify-between gap-2">
              <Etiqueta :status="c.status ?? ''" />
              <span class="text-xs font-semibold text-[var(--color-tinta-fraca)]">{{ c.formato }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </Estado>
  </section>
</template>
