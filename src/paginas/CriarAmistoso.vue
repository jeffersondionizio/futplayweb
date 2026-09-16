<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, type Clube } from '../servicos/api'

const { t } = useI18n()
const roteador = useRouter()

const clubes = ref<Clube[]>([])
const carregando = ref(true)
const salvando = ref(false)
const erro = ref<string | null>(null)

const form = ref({
  clube_mandante_id: '',
  clube_visitante_id: '',
  tipo: 'ABERTO',
  data_hora: '',
  local_nome: '',
  local_endereco: '',
  cidade: '',
  estado: '',
  observacoes: '',
})

// Desafio aberto não tem adversário definido: quem quiser se candidata depois.
const precisaAdversario = computed(() => form.value.tipo === 'DIRETO')

onMounted(async () => {
  try {
    clubes.value = await api.meusClubes()
    if (clubes.value[0]) form.value.clube_mandante_id = clubes.value[0].id
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
})

async function criar() {
  salvando.value = true
  erro.value = null
  try {
    const mandante = form.value.clube_mandante_id
    const visitante = precisaAdversario.value ? form.value.clube_visitante_id : ''
    // Mesmo formato de id do app: 4 do mandante, 4 do visitante, 8 do relógio.
    const pedaco = (s: string) => s.slice(0, 4).padEnd(4, '0')
    const id = (pedaco(mandante) + pedaco(visitante || mandante) + String(Date.now()).slice(-8)).toUpperCase()

    const criado = await api.criarAmistoso({
      ...form.value,
      clube_visitante_id: visitante,
      // O <input type="datetime-local"> devolve hora local sem fuso; o backend
      // guarda ISO. Converter aqui evita o jogo aparecer com 3 horas de erro.
      data_hora: form.value.data_hora ? new Date(form.value.data_hora).toISOString() : '',
      id,
    })
    roteador.push({ name: 'amistosos', query: { novo: criado.id } })
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <section class="secao grid place-items-center py-10">
    <form class="painel w-full max-w-2xl p-8" @submit.prevent="criar">
      <h1 class="text-2xl font-extrabold">{{ t('criar.amistoso') }}</h1>

      <p v-if="!carregando && !clubes.length" class="mt-6 rounded-lg bg-[var(--color-papel)] p-4 text-sm">
        {{ t('criar.semClube') }}
      </p>

      <div v-else class="mt-6 grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.mandante') }}</span>
          <select v-model="form.clube_mandante_id" required class="campo mt-1">
            <option v-for="c in clubes" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.tipoDesafio') }}</span>
          <select v-model="form.tipo" class="campo mt-1">
            <option value="ABERTO">{{ t('criar.aberto') }}</option>
            <option value="DIRETO">{{ t('criar.direto') }}</option>
          </select>
        </label>

        <label v-if="precisaAdversario" class="block sm:col-span-2">
          <span class="text-sm font-bold">{{ t('criar.visitante') }}</span>
          <input v-model="form.clube_visitante_id" class="campo mt-1" placeholder="id do clube" />
        </label>

        <label class="block sm:col-span-2">
          <span class="text-sm font-bold">{{ t('criar.dataHora') }}</span>
          <input v-model="form.data_hora" type="datetime-local" required class="campo mt-1" />
        </label>

        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.local') }}</span>
          <input v-model="form.local_nome" class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.endereco') }}</span>
          <input v-model="form.local_endereco" class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.cidade') }}</span>
          <input v-model="form.cidade" required class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.estado') }}</span>
          <input v-model="form.estado" maxlength="2" class="campo mt-1" />
        </label>

        <label class="block sm:col-span-2">
          <span class="text-sm font-bold">{{ t('criar.observacoes') }}</span>
          <textarea v-model="form.observacoes" rows="3" class="campo mt-1" />
        </label>
      </div>

      <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>

      <div class="mt-6 flex gap-3">
        <button type="submit" class="botao-primario" :disabled="salvando || !clubes.length">
          {{ salvando ? t('criar.salvando') : t('criar.salvar') }}
        </button>
        <RouterLink :to="{ name: 'amistosos' }" class="botao-secundario">{{ t('comum.voltar') }}</RouterLink>
      </div>
    </form>
  </section>
</template>
