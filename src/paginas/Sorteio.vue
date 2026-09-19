<script setup lang="ts">
/**
 * Sorteador de times.
 *
 * É a página que mais responde a busca direta — "sorteador de times de futebol"
 * em português, "random soccer team generator" em inglês — e funciona sem conta
 * nenhuma. Por isso todo o texto vem do i18n: a versão em `/en/team-generator`
 * precisa ser uma página inglesa de verdade, não uma tela em português com o
 * título traduzido.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { extrairNomes, sortearTimes } from '../servicos/sorteio'

const { t } = useI18n()

const texto = ref('')
const jogadoresPorTime = ref(5)
const times = ref<ReturnType<typeof sortearTimes>>([])
const nomes = computed(() => extrairNomes(texto.value))
const erro = ref('')

function sortear() {
  erro.value = ''
  if (nomes.value.length < 2) {
    times.value = []
    erro.value = t('sorteio.minimo')
    return
  }
  times.value = sortearTimes(nomes.value, jogadoresPorTime.value)
}

async function compartilhar() {
  const resultado = times.value
    .map((time) => `${t('sorteio.time', { n: time.numero })}\n${time.jogadores.map((nome) => `• ${nome}`).join('\n')}`)
    .join('\n\n')
  try {
    await navigator.clipboard.writeText(`${t('sorteio.cabecalhoCopia')}\n\n${resultado}`)
  } catch {
    erro.value = t('sorteio.semCopiar')
  }
}
</script>

<template>
  <section class="secao grid gap-6 py-10 lg:grid-cols-2">
    <div class="painel p-6">
      <p class="text-sm font-bold uppercase tracking-wide text-[var(--color-marca)]">{{ t('sorteio.selo') }}</p>
      <h1 class="mt-1 text-3xl font-extrabold">{{ t('sorteio.h1') }}</h1>
      <p class="mt-3 text-[var(--color-tinta-suave)]">{{ t('sorteio.lead') }}</p>

      <label class="mt-6 block">
        <span class="text-sm font-bold">{{ t('sorteio.jogadores') }} ({{ nomes.length }})</span>
        <textarea v-model="texto" class="campo mt-1 min-h-56" :placeholder="t('sorteio.exemplo')" />
      </label>
      <label class="mt-4 block max-w-52">
        <span class="text-sm font-bold">{{ t('sorteio.meta') }}</span>
        <select v-model.number="jogadoresPorTime" class="campo mt-1">
          <option v-for="n in 14" :key="n + 1" :value="n + 1">{{ t('sorteio.porTime', { n: n + 1 }) }}</option>
        </select>
      </label>
      <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>
      <button type="button" class="botao-primario mt-6" @click="sortear">{{ t('sorteio.sortear') }}</button>
    </div>

    <div class="painel p-6" aria-live="polite">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-extrabold">{{ t('sorteio.resultado') }}</h2>
        <button v-if="times.length" type="button" class="botao-secundario" @click="compartilhar">
          {{ t('sorteio.copiar') }}
        </button>
      </div>
      <p v-if="!times.length" class="mt-4 text-[var(--color-tinta-fraca)]">{{ t('sorteio.vazio') }}</p>
      <div v-else class="mt-5 grid gap-4 sm:grid-cols-2">
        <article v-for="time in times" :key="time.numero" class="rounded-xl border border-[var(--color-linha)] p-4">
          <h3 class="font-extrabold text-[var(--color-marca)]">
            {{ t('sorteio.time', { n: time.numero }) }}
            <span class="text-sm text-[var(--color-tinta-fraca)]">({{ time.jogadores.length }})</span>
          </h3>
          <ol class="mt-3 list-inside list-decimal space-y-1 text-sm"><li v-for="jogador in time.jogadores" :key="jogador">{{ jogador }}</li></ol>
        </article>
      </div>
    </div>
  </section>
  <section class="secao pb-12">
    <article class="painel p-6">
      <h2 class="text-2xl font-extrabold">{{ t('sorteio.comoTitulo') }}</h2>
      <p class="mt-3 text-[var(--color-tinta-suave)]">{{ t('sorteio.comoTexto') }}</p>
      <h2 class="mt-6 text-xl font-extrabold">{{ t('sorteio.peladaTitulo') }}</h2>
      <p class="mt-3 text-[var(--color-tinta-suave)]">{{ t('sorteio.peladaTexto') }}</p>
    </article>
  </section>
</template>
