<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { URL_APP_ANDROID } from '../servicos/configuracao'
const { t } = useI18n()
const ano = new Date().getFullYear()
</script>

<template>
  <footer class="rodape-site mt-16 border-t">
    <div class="secao flex flex-col gap-3 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span>© {{ ano }} {{ t('marca') }}. {{ t('rodape.direitos') }}</span>
      <nav class="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
        <a href="https://www.bibiprogramadortop.win/privacidade" class="hover:text-[var(--color-marca)]">{{ t('rodape.privacidade') }}</a>
        <a href="https://www.bibiprogramadortop.win/termos" class="hover:text-[var(--color-marca)]">{{ t('rodape.termos') }}</a>
        <a :href="URL_APP_ANDROID" rel="noopener" class="hover:text-[var(--color-marca)]">{{ t('rodape.app') }}</a>
      </nav>
    </div>
  </footer>
</template>
