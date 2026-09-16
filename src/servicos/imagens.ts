/**
 * URLs assinadas das fotos.
 *
 * A rota `GET /imagem/{pasta}/{id}` exige o cabeçalho `Authorization`, e uma
 * tag <img> não manda cabeçalho nenhum — por isso apontar o src direto para ela
 * devolve 401 e a foto some. O caminho certo é `POST /imagem/urls`, que recebe
 * um lote de chaves e devolve URLs assinadas do S3, essas sim utilizáveis no
 * src sem autenticação.
 *
 * Os pedidos são agrupados num único disparo por tick: uma lista com 20 fotos
 * viraria 20 requisições, e a rota aceita até 100 chaves de uma vez.
 */

import { API_BASE } from './configuracao'
import { tokenAtual } from './firebase'

export type Pasta = 'perfil' | 'clube' | 'grupo' | 'competicao'

/** Mesmas pastas que a Lambda de mídia aceita. */
const PREFIXO: Record<Pasta, string> = {
  perfil: 'images/profile/',
  clube: 'images/clubs/',
  grupo: 'images/groups/',
  competicao: 'images/competitions/',
}

export const chaveDe = (pasta: Pasta, id: string) => `${PREFIXO[pasta]}${id}.jpg`

/**
 * Escudo, capa de grupo e de campeonato sem sessão.
 *
 * `GET /publico/imagem/{pasta}/{id}` responde 302 para a URL assinada do S3, e
 * redirecionamento é a única coisa que uma tag <img> sabe seguir sozinha. Foto
 * de jogador não tem equivalente aqui de propósito: rosto de pessoa não é
 * vitrine.
 */
const urlPublica = (pasta: Pasta, id: string) =>
  (pasta === 'perfil' ? null : `${API_BASE}/publico/imagem/${pasta}/${id}`)

/** Chave -> URL assinada. Guardado enquanto a aba viver. */
const cache = new Map<string, string>()
/** Chaves já pedidas, para não disparar o mesmo lote duas vezes. */
const emVoo = new Map<string, Promise<void>>()

let fila = new Set<string>()
let agendado: Promise<void> | null = null

async function despachar(): Promise<void> {
  const chaves = [...fila]
  fila = new Set()
  agendado = null
  if (!chaves.length) return

  const token = await tokenAtual()
  if (!token) return

  for (let i = 0; i < chaves.length; i += 100) {
    const lote = chaves.slice(i, i + 100)
    try {
      const r = await fetch(`${API_BASE}/imagem/urls`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ chaves: lote }),
      })
      if (!r.ok) continue
      const { urls } = (await r.json()) as { urls?: Record<string, string> }
      for (const [chave, url] of Object.entries(urls ?? {})) if (url) cache.set(chave, url)
    } catch {
      // Foto que não carrega não pode derrubar a tela; o componente mostra a
      // inicial do nome no lugar.
    }
  }
}

/** Resolve a URL assinada de uma chave, agrupando com as demais do mesmo tick. */
export async function urlAssinada(pasta: Pasta, id: string): Promise<string | null> {
  if (!id) return null
  const chave = chaveDe(pasta, id)
  if (cache.has(chave)) return cache.get(chave)!

  // Visitante deslogado não tem token para pedir o lote; usa a rota pública.
  if (!(await tokenAtual())) return urlPublica(pasta, id)

  if (!emVoo.has(chave)) {
    fila.add(chave)
    agendado ??= Promise.resolve().then(despachar)
    emVoo.set(
      chave,
      agendado.finally(() => emVoo.delete(chave)),
    )
  }
  await emVoo.get(chave)
  return cache.get(chave) ?? null
}
