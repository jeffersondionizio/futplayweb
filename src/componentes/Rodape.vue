<script setup lang="ts">
/**
 * Rodapé.
 *
 * Tudo aqui tem o mesmo peso visual de propósito: são avisos legais e o nome do
 * site, não navegação. Antes o bloco misturava tamanhos e um link em negrito
 * para a loja, o que dava a três linhas de aviso a aparência de um menu.
 *
 * O hover também não vem de utilitária do Tailwind: `hover:text-[…]` entra na
 * layer `utilities` e ganharia do tema, pintando o link de verde escuro em cima
 * de um rodapé verde escuro.
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
      <p class="rodape-marca">{{ t('marca') }}</p>

      <nav class="rodape-links" :aria-label="t('rodape.legal')">
        <a v-for="link in links" :key="link.chave" :href="link.href" class="rodape-link">
          {{ t(`rodape.${link.chave}`) }}
        </a>
      </nav>

      <p class="rodape-direitos">© {{ ano }} {{ t('marca') }}. {{ t('rodape.direitos') }}</p>
    </div>
  </footer>
</template>
