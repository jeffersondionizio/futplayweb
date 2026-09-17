<script setup lang="ts">
import { computed, ref } from 'vue'
import { extrairNomes, sortearTimes } from '../servicos/sorteio'

const texto = ref('')
const jogadoresPorTime = ref(5)
const times = ref<ReturnType<typeof sortearTimes>>([])
const nomes = computed(() => extrairNomes(texto.value))
const erro = ref('')

function sortear() {
  erro.value = ''
  if (nomes.value.length < 2) {
    times.value = []
    erro.value = 'Informe pelo menos dois jogadores.'
    return
  }
  times.value = sortearTimes(nomes.value, jogadoresPorTime.value)
}

async function compartilhar() {
  const resultado = times.value.map((time) => `Time ${time.numero}\n${time.jogadores.map((nome) => `• ${nome}`).join('\n')}`).join('\n\n')
  try {
    await navigator.clipboard.writeText(`FutPlay — sorteio de times\n\n${resultado}`)
  } catch {
    erro.value = 'Não foi possível copiar. Selecione o resultado manualmente.'
  }
}
</script>

<template>
  <section class="secao grid gap-6 py-10 lg:grid-cols-2">
    <div class="painel p-6">
      <p class="text-sm font-bold uppercase tracking-wide text-[var(--color-marca)]">Ferramenta do organizador</p>
      <h1 class="mt-1 text-3xl font-extrabold">Sorteio rápido de times</h1>
      <p class="mt-3 text-[var(--color-tinta-suave)]">Cole um jogador por linha. Os nomes repetidos são removidos; quem sobrar forma o time reserva.</p>

      <label class="mt-6 block">
        <span class="text-sm font-bold">Jogadores ({{ nomes.length }})</span>
        <textarea v-model="texto" class="campo mt-1 min-h-56" placeholder="Ana&#10;Bruno&#10;Carlos" />
      </label>
      <label class="mt-4 block max-w-52">
        <span class="text-sm font-bold">Meta de jogadores por time</span>
        <select v-model.number="jogadoresPorTime" class="campo mt-1">
          <option v-for="n in 14" :key="n + 1" :value="n + 1">{{ n + 1 }} jogadores</option>
        </select>
      </label>
      <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>
      <button type="button" class="botao-primario mt-6" @click="sortear">Sortear times</button>
    </div>

    <div class="painel p-6" aria-live="polite">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-extrabold">Resultado</h2>
        <button v-if="times.length" type="button" class="botao-secundario" @click="compartilhar">Copiar</button>
      </div>
      <p v-if="!times.length" class="mt-4 text-[var(--color-tinta-fraca)]">O resultado aparecerá aqui.</p>
      <div v-else class="mt-5 grid gap-4 sm:grid-cols-2">
        <article v-for="time in times" :key="time.numero" class="rounded-xl border border-[var(--color-linha)] p-4" :class="{ 'bg-[var(--color-papel)]': time.reserva }">
          <h3 class="font-extrabold text-[var(--color-marca)]">{{ time.reserva ? 'Time reserva' : `Time ${time.numero}` }} <span class="text-sm text-[var(--color-tinta-fraca)]">({{ time.jogadores.length }})</span></h3>
          <ol class="mt-3 list-inside list-decimal space-y-1 text-sm"><li v-for="jogador in time.jogadores" :key="jogador">{{ jogador }}</li></ol>
        </article>
      </div>
    </div>
  </section>
</template>
