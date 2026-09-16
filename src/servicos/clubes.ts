/**
 * Resolução de nomes de clube.
 *
 * As rotas de campeonato e amistoso devolvem só `clube_id`. `GET /clubes`
 * traz apenas os clubes de que o usuário participa, então a tela mostrava o
 * identificador cru para todos os outros — e num campeonato a maioria dos
 * clubes é de terceiros.
 *
 * Aqui os desconhecidos são buscados um a um por `GET /clubes/{id}`, com cache
 * em memória. Um clube que não existe mais fica registrado como ausente para
 * não ser pedido de novo a cada renderização.
 */

import { reactive } from 'vue'
import { api, type Clube } from './api'

const conhecidos = reactive<Record<string, Clube | null>>({})
const buscando = new Set<string>()

/** Popula o cache com clubes já carregados, evitando ida à rede. */
export function registrar(clubes: Clube[]) {
  for (const c of clubes) conhecidos[c.id] = c
}

/**
 * Nome do clube. Devolve o que tiver na hora e dispara a busca do que faltar;
 * como o cache é reativo, a tela se atualiza sozinha quando a resposta chega.
 */
export function nomeDoClube(id: string, ausente = '—'): string {
  if (!id) return ausente
  const achado = conhecidos[id]
  if (achado) return achado.nome
  if (achado === null) return id

  if (!buscando.has(id)) {
    buscando.add(id)
    api
      .clube(id)
      .then((c) => {
        conhecidos[id] = c
      })
      .catch(() => {
        conhecidos[id] = null
      })
      .finally(() => buscando.delete(id))
  }
  return id
}

export const clubeConhecido = (id: string): Clube | null => conhecidos[id] ?? null
