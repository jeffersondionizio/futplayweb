<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usarSessao } from '../estado/sessao'
import { URL_APP_ANDROID } from '../servicos/configuracao'

const { t } = useI18n()
const sessao = usarSessao()

const recursos = [
  { chave: 'sorteio', icone: 'M7 4h10M7 4a3 3 0 0 1-3 3m3-3v13m10-13a3 3 0 0 0 3 3m-3-3v13M4 7v4a8 8 0 0 0 16 0V7' },
  { chave: 'ranking', icone: 'M4 19h4v-7H4v7Zm6 0h4V5h-4v14Zm6 0h4v-10h-4v10Z' },
  { chave: 'campeonato', icone: 'M6 4h12v3a6 6 0 0 1-12 0V4Zm6 9v4m-3 3h6' },
  { chave: 'amistoso', icone: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3Z' },
]

const passos = ['um', 'dois', 'tres'] as const
</script>

<template>
  <!-- herói -->
  <section class="relative overflow-hidden border-b border-[var(--color-linha)] bg-white">
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.07]"
      style="background-image: radial-gradient(var(--color-marca) 1px, transparent 1px); background-size: 22px 22px"
      aria-hidden="true"
    />
    <div class="secao relative grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
      <div>
        <p class="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--color-marca)]">
          {{ t('home.mesmaConta') }}
        </p>
        <h1 class="text-4xl font-extrabold leading-tight sm:text-5xl">{{ t('home.titulo') }}</h1>
        <p class="mt-4 max-w-xl text-lg text-[var(--color-tinta-suave)]">{{ t('home.subtitulo') }}</p>

        <div class="mt-8 flex flex-wrap gap-3">
          <RouterLink v-if="!sessao.autenticado" :to="{ name: 'entrar' }" class="botao-primario">
            {{ t('home.entrar') }}
          </RouterLink>
          <RouterLink :to="{ name: 'peladas' }" class="botao-secundario">
            {{ t('home.verPeladas') }}
          </RouterLink>
          <a :href="URL_APP_ANDROID" rel="noopener" class="botao-secundario">{{ t('home.baixarApp') }}</a>
        </div>
      </div>

      <div class="painel p-6">
        <h2 class="text-sm font-bold uppercase tracking-wide text-[var(--color-tinta-fraca)]">
          {{ t('home.comoFunciona') }}
        </h2>
        <ol class="mt-4 space-y-5">
          <li v-for="(passo, i) in passos" :key="passo" class="flex gap-4">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-marca-claro)]
                     font-extrabold text-[var(--color-marca)]"
            >{{ i + 1 }}</span>
            <div>
              <p class="font-bold">{{ t(`home.passos.${passo}.titulo`) }}</p>
              <p class="text-sm text-[var(--color-tinta-suave)]">{{ t(`home.passos.${passo}.texto`) }}</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>

  <!-- recursos -->
  <section class="secao py-16">
    <h2 class="text-center text-3xl font-extrabold">{{ t('home.recursos.titulo') }}</h2>
    <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <article v-for="r in recursos" :key="r.chave" class="painel p-6">
        <span
          class="grid h-11 w-11 place-items-center rounded-lg bg-[var(--color-marca-claro)] text-[var(--color-marca)]"
          aria-hidden="true"
        >
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path :d="r.icone" />
          </svg>
        </span>
        <h3 class="mt-4 text-lg font-bold">{{ t(`home.recursos.${r.chave}.titulo`) }}</h3>
        <p class="mt-1 text-sm text-[var(--color-tinta-suave)]">{{ t(`home.recursos.${r.chave}.texto`) }}</p>
      </article>
    </div>
  </section>

  <!-- mesma conta -->
  <section class="secao pb-16">
    <div class="painel flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-2xl font-extrabold">{{ t('home.mesmaConta') }}</h2>
        <p class="mt-2 max-w-2xl text-[var(--color-tinta-suave)]">{{ t('home.mesmaContaTexto') }}</p>
      </div>
      <RouterLink
        :to="{ name: sessao.autenticado ? 'peladas' : 'entrar' }"
        class="botao-primario shrink-0"
      >{{ sessao.autenticado ? t('home.verPeladas') : t('home.entrar') }}</RouterLink>
    </div>
  </section>
</template>
