<script setup lang="ts">
/**
 * Rodapé.
 *
 * Antes eram três blocos soltos — o nome do site, os links e o copyright — e o
 * nome aparecia duas vezes, já que a linha de copyright também o diz. Agora são
 * duas linhas centradas, com o mesmo tamanho de texto: é aviso legal, não
 * navegação.
 *
 * O hover não vem de utilitária do Tailwind de propósito: `hover:text-[…]`
 * entra na layer `utilities`, resolvida depois de `components`, e pintaria o
 * link de verde escuro em cima de um rodapé verde escuro.
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const ano = new Date().getFullYear()

const links = [
  { chave: 'privacidade', href: 'https://www.bibiprogramadortop.win/privacidade' },
  { chave: 'termos', href: 'https://www.bibiprogramadortop.win/termos' },
] as const
</script>

<template>
  <footer class="rodape-site border-t">
    <div class="secao rodape-conteudo">
      <nav class="rodape-links" :aria-label="t('rodape.legal')">
        <a v-for="link in links" :key="link.chave" :href="link.href" class="rodape-link">
          {{ t(`rodape.${link.chave}`) }}
        </a>
      </nav>

      <p class="rodape-direitos">© {{ ano }} {{ t('marca') }}. {{ t('rodape.direitos') }}</p>
    </div>
  </footer>
</template>
