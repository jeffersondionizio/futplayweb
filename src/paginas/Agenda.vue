<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type Grupo } from '../servicos/api'
import { ordenarAgenda } from '../servicos/agenda'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'

const grupos = ref<Grupo[]>([])
const carregando = ref(true)
const erro = ref<string | null>(null)
const agenda = computed(() => ordenarAgenda(grupos.value))

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    grupos.value = await api.meusGrupos()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

const quando = (data: Date | null) => data
  ? data.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
  : 'Horário ainda não definido'

onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-bold uppercase tracking-wide text-[var(--color-marca)]">Minha agenda</p>
        <h1 class="mt-1 text-3xl font-extrabold">Próximas peladas</h1>
        <p class="mt-2 text-[var(--color-tinta-suave)]">Os horários dos seus grupos, ordenados para você não perder o jogo.</p>
      </div>
      <RouterLink :to="{ name: 'criar-pelada' }" class="botao-primario">Criar pelada</RouterLink>
    </header>

    <Estado :carregando="carregando" :erro="erro" :vazio="!agenda.length" texto-vazio="Você ainda não participa de nenhuma pelada." @recarregar="carregar">
      <ol class="mt-7 grid gap-4 lg:grid-cols-2">
        <li v-for="item in agenda" :key="item.grupo.id" class="painel flex gap-4 p-5">
          <Foto pasta="grupo" :id="item.grupo.id" :nome="item.grupo.nome" classe="h-12 w-12 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold uppercase tracking-wide text-[var(--color-tinta-fraca)]">{{ quando(item.quando) }}</p>
            <h2 class="mt-1 truncate text-lg font-extrabold">{{ item.grupo.nome }}</h2>
            <p class="mt-1 truncate text-sm text-[var(--color-tinta-suave)]">{{ item.grupo.local || item.grupo.cidade || 'Local não informado' }}</p>
          </div>
          <RouterLink :to="{ name: 'pelada', params: { id: item.grupo.id } }" class="self-center text-sm font-bold text-[var(--color-marca)]">Ver</RouterLink>
        </li>
      </ol>
    </Estado>
  </section>
</template>
