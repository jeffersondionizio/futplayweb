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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { caminhoNoIdioma, caminhoTraduzido, idiomaDoCaminho } from '../servicos/seo'

const { t } = useI18n()
const rota = useRoute()
const ano = new Date().getFullYear()

const links = [
  { chave: 'privacidade', href: 'https://www.bibiprogramadortop.win/privacidade' },
  { chave: 'termos', href: 'https://www.bibiprogramadortop.win/termos' },
] as const

const idioma = computed(() => idiomaDoCaminho(rota.path))

/**
 * Navegação para as páginas públicas, em todas as telas.
 *
 * O rodapé era só aviso legal. Com os links aqui, cada página passa autoridade
 * para as outras quatro e o rastreador chega a todas a partir de qualquer
 * ponto do site — inclusive de uma pelada aberta por link compartilhado, que
 * antes era um beco sem nenhum caminho de volta para o conteúdo indexável.
 */
const publicas = computed(() =>
  (['sorteio', 'peladas', 'campeonatos', 'amistosos', 'clubes'] as const).map((chave) => ({
    chave,
    para: caminhoNoIdioma(chave, idioma.value),
  })),
)

/** O par da página atual no outro idioma: um link real, que o Google segue. */
const outroIdioma = computed(() => {
  const codigo = idioma.value === 'en' ? 'pt-BR' : 'en'
  return {
    codigo,
    rotulo: codigo === 'en' ? 'English' : 'Português',
    para: caminhoTraduzido(rota.path, codigo),
  }
})
</script>

<template>
  <footer class="rodape-site border-t">
    <div class="secao rodape-conteudo">
      <nav class="rodape-links" :aria-label="t('marca')">
        <RouterLink v-for="p in publicas" :key="p.chave" :to="p.para" class="rodape-link">
          {{ t(`nav.${p.chave}`) }}
        </RouterLink>
        <RouterLink :to="outroIdioma.para" class="rodape-link" :hreflang="outroIdioma.codigo">
          {{ outroIdioma.rotulo }}
        </RouterLink>
      </nav>

      <nav class="rodape-links" :aria-label="t('rodape.legal')">
        <a v-for="link in links" :key="link.chave" :href="link.href" class="rodape-link">
          {{ t(`rodape.${link.chave}`) }}
        </a>
      </nav>

      <p class="rodape-direitos">© {{ ano }} {{ t('marca') }}. {{ t('rodape.direitos') }}</p>
    </div>
  </footer>
</template>
