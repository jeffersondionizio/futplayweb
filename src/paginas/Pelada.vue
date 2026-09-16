<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, type Grupo, type Jogador } from '../servicos/api'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'
import Chat from '../componentes/Chat.vue'

const { t, locale } = useI18n()
const rota = useRoute()
const id = String(rota.params.id)

const grupo = ref<Grupo | null>(null)
const membros = ref<Jogador[]>([])
const carregando = ref(true)
const erro = ref<string | null>(null)

/**
 * O ranking da temporada chega como JSON em string — é o mesmo campo que o
 * aplicativo grava. Aqui só lemos: a pontuação usa os mesmos pesos de
 * AppConfig.Pontuacao, para o site não mostrar um número diferente do app.
 */
const PESOS: Record<string, number> = {
  gols: 8, assistencias: 6, roubadasDeBola: 2, faltas: -2, faltasSofridas: 2,
  chutesAGol: 1, defesas: 1, interceptacoes: 1, defesasPenaltis: 12,
}

type Scout = Record<string, number | string>

const ranking = computed(() => {
  const cru = grupo.value?.rank_temporada
  if (!cru || cru === '{}') return []
  try {
    const dados = JSON.parse(cru) as { scouts?: Record<string, Scout> }
    const scouts = dados.scouts ?? {}
    return Object.entries(scouts)
      .map(([uid, s]) => ({
        uid,
        nome: membros.value.find((m) => m.id === uid)?.nome ?? uid.slice(0, 8),
        gols: Number(s.gols ?? 0),
        assistencias: Number(s.assistencias ?? 0),
        pontos: Object.entries(PESOS).reduce((tot, [k, p]) => tot + Number(s[k] ?? 0) * p, 0),
      }))
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 10)
  } catch {
    return []
  }
})

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const [g, m] = await Promise.all([api.grupo(id), api.membrosDoGrupo(id).catch(() => [] as Jogador[])])
    grupo.value = g
    membros.value = m
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

const quando = (iso?: string) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(locale.value, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(carregar)
</script>

<template>
  <Estado :carregando="carregando" :erro="erro" @recarregar="carregar">
    <section v-if="grupo" class="secao py-10">
      <RouterLink :to="{ name: 'peladas' }" class="text-sm font-bold text-[var(--color-tinta-fraca)] hover:text-[var(--color-marca)]">
        ← {{ t('comum.voltar') }}
      </RouterLink>

      <header class="painel mt-4 flex flex-wrap items-center gap-4 p-6">
        <Foto pasta="grupo" :id="grupo.id" :nome="grupo.nome" classe="h-16 w-16" />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-extrabold">{{ grupo.nome }}</h1>
          <p class="text-sm text-[var(--color-tinta-fraca)]">{{ grupo.cidade || t('comum.naoInformado') }}</p>
        </div>
      </header>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <dl class="painel grid grid-cols-2 gap-4 p-6 lg:col-span-1">
          <div>
            <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.quando') }}</dt>
            <dd class="font-semibold">{{ grupo.data_peladaproxima ? quando(grupo.data_peladaproxima) : (grupo.dia_semana || '-') }}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.onde') }}</dt>
            <dd class="font-semibold">{{ grupo.local || t('comum.naoInformado') }}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.valor') }}</dt>
            <dd class="font-semibold">{{ grupo.valor ? `R$ ${grupo.valor}` : '-' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.jogadores') }}</dt>
            <dd class="font-semibold">{{ grupo.inscritos ?? membros.length }}</dd>
          </div>
        </dl>

        <div class="painel overflow-hidden lg:col-span-2">
          <h2 class="border-b border-[var(--color-linha)] px-6 py-4 font-bold">
            {{ t('home.recursos.ranking.titulo') }}
          </h2>
          <table v-if="ranking.length" class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">
                <th class="px-6 py-2">{{ t('tabela.posicao') }}</th>
                <th class="px-3 py-2">{{ t('cadastro.nome') }}</th>
                <th class="px-3 py-2 text-center">G</th>
                <th class="px-3 py-2 text-center">A</th>
                <th class="px-6 py-2 text-center">{{ t('tabela.pontos') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in ranking" :key="r.uid"
                  class="border-t border-[var(--color-linha)]"
                  :class="i % 2 ? 'bg-[var(--color-zebra)]' : ''">
                <td class="px-6 py-2.5 font-bold">{{ i + 1 }}</td>
                <td class="px-3 py-2.5 font-semibold">{{ r.nome }}</td>
                <td class="px-3 py-2.5 text-center">{{ r.gols }}</td>
                <td class="px-3 py-2.5 text-center">{{ r.assistencias }}</td>
                <td class="px-6 py-2.5 text-center font-extrabold text-[var(--color-marca)]">{{ r.pontos }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="p-8 text-center text-[var(--color-tinta-fraca)]">{{ t('peladas.vazio') }}</p>
        </div>
      </div>

      <div v-if="membros.length" class="painel mt-6 p-6">
        <h2 class="mb-4 font-bold">{{ t('peladas.jogadores') }}</h2>
        <ul class="flex flex-wrap gap-3">
          <li v-for="m in membros" :key="m.id"
              class="flex items-center gap-2 rounded-full border border-[var(--color-linha)] py-1 pl-1 pr-3">
            <Foto pasta="perfil" :id="m.id" :nome="m.nome" classe="h-8 w-8" redonda />
            <span class="text-sm font-semibold">{{ m.nome }}</span>
          </li>
        </ul>
      </div>

      <Chat class="mt-6" contexto="grupo" :id="grupo.id" />
    </section>
  </Estado>
</template>
