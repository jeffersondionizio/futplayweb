<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usarSessao } from '../estado/sessao'

const { t } = useI18n()
const sessao = usarSessao()
const rota = useRoute()
const roteador = useRouter()

// Assim que a sessão existir, volta para onde a pessoa queria ir.
watch(
  () => sessao.autenticado,
  (entrou) => {
    if (!entrou) return
    const destino = (rota.query.destino as string) || '/peladas'
    roteador.replace(sessao.precisaCompletar ? '/cadastro' : destino)
  },
  { immediate: true },
)
</script>

<template>
  <section class="secao grid min-h-[70vh] place-items-center py-16">
    <div class="painel w-full max-w-md p-8 text-center">
      <span class="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-[var(--color-marca-escuro)] text-2xl font-extrabold text-white"
            style="box-shadow: inset 0 -4px 0 var(--color-destaque)" aria-hidden="true">F</span>
      <h1 class="mt-5 text-2xl font-extrabold">{{ t('entrar.titulo') }}</h1>
      <p class="mt-2 text-sm text-[var(--color-tinta-suave)]">{{ t('entrar.texto') }}</p>

      <button type="button" class="botao-primario mt-6 w-full" :disabled="sessao.entrando" @click="sessao.entrar()">
        <svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#fff" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2Z" opacity=".9"/>
          <path fill="#fff" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" opacity=".75"/>
          <path fill="#fff" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z" opacity=".6"/>
          <path fill="#fff" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.6 9.4 5.9 12 5.9Z"/>
        </svg>
        {{ sessao.entrando ? t('comum.carregando') : t('entrar.botao') }}
      </button>

      <p v-if="sessao.erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">
        {{ sessao.erro }}
      </p>
    </div>
  </section>
</template>
