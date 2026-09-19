<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { usarSessao } from '../estado/sessao'
import { caminhoTraduzido, idiomaDoCaminho } from '../servicos/seo'
import SeletorIdioma from './SeletorIdioma.vue'
import Foto from './Foto.vue'

const { t } = useI18n()
const sessao = usarSessao()
const rota = useRoute()
const roteador = useRouter()
const menuAberto = ref(false)

const idioma = computed(() => idiomaDoCaminho(rota.path))

/**
 * O link segue o idioma do endereço aberto.
 *
 * `{ name }` resolveria sempre para o caminho português — quem estivesse em
 * `/en/team-generator` voltaria para `/campeonatos` ao clicar no menu, trocando
 * a língua sem pedir.
 */
const destino = (nome: string) => caminhoTraduzido(roteador.resolve({ name: nome }).path, idioma.value)

const links = [
  { nome: 'peladas', rotulo: 'nav.peladas' },
  { nome: 'campeonatos', rotulo: 'nav.campeonatos' },
  { nome: 'amistosos', rotulo: 'nav.amistosos' },
  { nome: 'clubes', rotulo: 'nav.clubes' },
  { nome: 'agenda', rotulo: 'nav.agenda' },
  { nome: 'sorteio', rotulo: 'nav.sorteio' },
]
</script>

<template>
  <header class="cabecalho-site sticky top-0 z-40 border-b">
    <div class="secao flex h-16 items-center justify-between gap-4">
      <RouterLink :to="destino('inicio')" class="marca-site flex items-center gap-2 font-extrabold">
        <img src="/favicon.svg" alt="" class="h-9 w-9 shrink-0" aria-hidden="true" />
        <span>{{ t('marca') }}</span>
      </RouterLink>

      <nav class="hidden items-center gap-1 md:flex" :aria-label="t('marca')">
        <RouterLink
          v-for="l in links"
          :key="l.nome"
          :to="destino(l.nome)"
          class="link-cabecalho rounded-lg px-3 py-2 text-sm font-semibold"
          active-class="link-ativo"
        >{{ t(l.rotulo) }}</RouterLink>
      </nav>

      <div class="flex items-center gap-2">
        <SeletorIdioma />

        <RouterLink
          v-if="sessao.autenticado"
          :to="destino('conta')"
          class="conta-cabecalho flex items-center gap-2 rounded-lg py-1 pl-1 pr-3"
        >
          <Foto v-if="sessao.jogador?.id" pasta="perfil" :id="sessao.jogador.id" :nome="sessao.jogador.nome" classe="h-8 w-8" redonda />
          <span class="hidden text-sm font-semibold sm:inline">{{ sessao.jogador?.nome }}</span>
        </RouterLink>

        <RouterLink v-else :to="destino('entrar')" class="botao-primario">
          {{ t('nav.entrar') }}
        </RouterLink>

        <button
          type="button"
          class="rounded-lg p-2 md:hidden"
          :aria-label="t('nav.inicio')"
          :aria-expanded="menuAberto"
          @click="menuAberto = !menuAberto"
        >
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round" />
          </svg>
        </button>

      </div>
    </div>

    <nav v-if="menuAberto" class="border-t border-[var(--color-linha)] bg-white md:hidden">
      <div class="secao flex flex-col py-2">
        <RouterLink
          v-for="l in links"
          :key="l.nome"
          :to="destino(l.nome)"
          class="rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--color-tinta-suave)]"
          active-class="bg-[var(--color-marca-claro)] text-[var(--color-marca)]"
          @click="menuAberto = false"
        >{{ t(l.rotulo) }}</RouterLink>
      </div>
    </nav>
  </header>
</template>
