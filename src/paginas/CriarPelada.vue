<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../servicos/api'
import { usarSessao } from '../estado/sessao'

const roteador = useRouter()
const sessao = usarSessao()
const form = ref({ nome: '', tipo_pelada: 'Society', data: '', hora: '', vagas: 14, valor: '0', local: '', cidade: '' })
const salvando = ref(false)
const erro = ref<string | null>(null)

const idDaPelada = (nome: string) => `${nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 12)}${Date.now().toString().slice(-8)}`

function valorNormalizado(valor: string) {
  const numero = Number(valor.trim().replace(',', '.'))
  return Number.isFinite(numero) && numero >= 0 ? numero.toFixed(2) : null
}

async function publicar() {
  erro.value = null
  const valor = valorNormalizado(form.value.valor)
  if (!valor) {
    erro.value = 'Informe um valor válido, incluindo 0 para uma pelada gratuita.'
    return
  }
  const data = new Date(`${form.value.data}T${form.value.hora}`)
  if (Number.isNaN(data.getTime()) || data <= new Date()) {
    erro.value = 'Escolha uma data e hora futuras.'
    return
  }
  if (!sessao.jogador?.id) return
  salvando.value = true
  try {
    const id = idDaPelada(form.value.nome)
    // Mesmo contrato usado pelo app Android; o backend define a entrada do criador.
    await api.criarGrupo({
      id,
      nome: form.value.nome.trim(),
      criado_por: sessao.jogador.id,
      admin: sessao.jogador.id,
      dia_semana: data.toLocaleDateString('pt-BR'),
      data_peladaproxima: data.toLocaleDateString('pt-BR'),
      hora_inicio: form.value.hora,
      hora_fim: form.value.hora,
      tipo_pelada: form.value.tipo_pelada,
      cidade: form.value.cidade.trim().toLowerCase(),
      local: form.value.local.trim(),
      pelada_proxima: 'true',
      qtde_jogadores: String(form.value.vagas),
      valor,
      avaliacao_liberada: 'false',
      criado_em: String(Date.now()),
    })
    roteador.push({ name: 'pelada', params: { id } })
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <section class="secao grid place-items-center py-10">
    <form class="painel w-full max-w-2xl p-8" @submit.prevent="publicar">
      <p class="text-sm font-bold uppercase tracking-wide text-[var(--color-marca)]">Pelada pública</p>
      <h1 class="mt-1 text-2xl font-extrabold">Criar pelada</h1>
      <p class="mt-2 text-sm text-[var(--color-tinta-suave)]">Publique uma partida e deixe outros jogadores pedirem para entrar.</p>
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2"><span class="text-sm font-bold">Nome</span><input v-model.trim="form.nome" required maxlength="80" class="campo mt-1" placeholder="Pelada de quarta" /></label>
        <label class="block"><span class="text-sm font-bold">Tipo</span><select v-model="form.tipo_pelada" class="campo mt-1"><option>Society</option><option>Futsal</option><option>Campo</option><option>Rua</option></select></label>
        <label class="block"><span class="text-sm font-bold">Vagas</span><input v-model.number="form.vagas" required min="2" max="60" type="number" class="campo mt-1" /></label>
        <label class="block"><span class="text-sm font-bold">Data</span><input v-model="form.data" required type="date" :min="new Date().toISOString().slice(0, 10)" class="campo mt-1" /></label>
        <label class="block"><span class="text-sm font-bold">Hora</span><input v-model="form.hora" required type="time" class="campo mt-1" /></label>
        <label class="block"><span class="text-sm font-bold">Cidade</span><input v-model.trim="form.cidade" required class="campo mt-1" /></label>
        <label class="block"><span class="text-sm font-bold">Local</span><input v-model.trim="form.local" required class="campo mt-1" /></label>
        <label class="block sm:col-span-2"><span class="text-sm font-bold">Valor por jogador (R$)</span><input v-model="form.valor" required inputmode="decimal" class="campo mt-1" placeholder="0,00" /></label>
      </div>
      <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>
      <div class="mt-6 flex gap-3"><button type="submit" class="botao-primario" :disabled="salvando">{{ salvando ? 'Publicando…' : 'Publicar pelada' }}</button><RouterLink :to="{ name: 'peladas' }" class="botao-secundario">Cancelar</RouterLink></div>
    </form>
  </section>
</template>
