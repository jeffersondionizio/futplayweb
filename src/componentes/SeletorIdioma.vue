<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { IDIOMAS, salvarIdioma, type CodigoIdioma } from '../servicos/idioma'

const { locale, t } = useI18n()
const aberto = ref(false)
const raiz = ref<HTMLElement | null>(null)

const atual = () => IDIOMAS.find((i) => i.codigo === locale.value) ?? IDIOMAS[0]

function escolher(codigo: CodigoIdioma) {
  locale.value = codigo
  salvarIdioma(codigo)
  aberto.value = false
}

// Fecha ao clicar fora: menu preso aberto atrapalha no celular.
const fecharFora = (e: MouseEvent) => {
  if (raiz.value && !raiz.value.contains(e.target as Node)) aberto.value = false
}
onMounted(() => document.addEventListener('click', fecharFora))
onBeforeUnmount(() => document.removeEventListener('click', fecharFora))
</script>

<template>
  <div ref="raiz" class="seletor-idioma relative">
    <!--
      O hover não vem de utilitária do Tailwind de propósito.

      `hover:bg-[…]` entra na layer `utilities`, que o navegador resolve depois
      de `components` — e layer ganha de especificidade. Com o cabeçalho verde
      pintando o texto de branco, o hover trocava o fundo por um verde quase
      branco e o rótulo sumia dentro do próprio botão, sem que nenhuma regra do
      tema conseguisse impedir. Aqui o estado fica no CSS do componente.
    -->
    <button
      type="button"
      class="gatilho-idioma flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold"
      :aria-label="t('comum.idioma')"
      :aria-expanded="aberto"
      @click="aberto = !aberto"
    >
      <span aria-hidden="true">{{ atual().bandeira }}</span>
      <span class="hidden sm:inline">{{ atual().rotulo }}</span>
      <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" stroke-width="2" fill="none" />
      </svg>
    </button>

    <ul
      v-if="aberto"
      class="painel absolute right-0 z-50 mt-1 w-44 overflow-hidden p-1"
      role="listbox"
    >
      <li v-for="idioma in IDIOMAS" :key="idioma.codigo">
        <button
          type="button"
          role="option"
          :aria-selected="idioma.codigo === locale"
          class="opcao-idioma flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
          @click="escolher(idioma.codigo)"
        >
          <span aria-hidden="true">{{ idioma.bandeira }}</span>
          {{ idioma.rotulo }}
        </button>
      </li>
    </ul>
  </div>
</template>
