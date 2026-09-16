<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <section class="secao grid min-h-[60vh] place-content-center text-center">
    <p class="text-6xl font-extrabold text-[var(--color-marca)]">404</p>
    <p class="mt-3 text-[var(--color-tinta-suave)]">{{ t('comum.erro') }}</p>
    <RouterLink :to="{ name: 'inicio' }" class="botao-primario mx-auto mt-6">{{ t('comum.voltar') }}</RouterLink>
  </section>
</template>
