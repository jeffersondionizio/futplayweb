export type TimeSorteado = { numero: number; jogadores: string[] }

/** Aceita listas coladas do WhatsApp, mantendo somente nomes únicos e úteis. */
export function extrairNomes(texto: string): string[] {
  const vistos = new Set<string>()
  return texto.split(/\r?\n/).flatMap((linha) => {
    const nome = linha
      .trim()
      .replace(/^[-•*]+\s*/, '')
      .replace(/^\d{1,2}\s*[-.):]\s*/, '')
      .replace(/\s+/g, ' ')
    if (!nome || !/[\p{L}]/u.test(nome) || /^(pix:|valor\b|banco\b|diaristas?:?$)/iu.test(nome)) return []
    const chave = nome.toLocaleLowerCase('pt-BR')
    return vistos.has(chave) ? [] : (vistos.add(chave), [nome])
  })
}

/** Replica o sorteio rápido do app: times aleatórios, com diferença máxima de uma pessoa. */
export function sortearTimes(nomes: string[], jogadoresPorTime: number, aleatorio = Math.random): TimeSorteado[] {
  if (nomes.length < 2 || !Number.isInteger(jogadoresPorTime) || jogadoresPorTime < 1) return []
  const embaralhados = [...nomes]
  for (let indice = embaralhados.length - 1; indice > 0; indice -= 1) {
    const alvo = Math.floor(aleatorio() * (indice + 1))
    ;[embaralhados[indice], embaralhados[alvo]] = [embaralhados[alvo], embaralhados[indice]]
  }
  const quantidadeTimes = Math.min(embaralhados.length, Math.max(2, Math.round(embaralhados.length / jogadoresPorTime)))
  const base = Math.floor(embaralhados.length / quantidadeTimes)
  const sobra = embaralhados.length % quantidadeTimes
  let inicio = 0
  return Array.from({ length: quantidadeTimes }, (_, indice) => {
    const tamanho = base + (indice < sobra ? 1 : 0)
    const jogadores = embaralhados.slice(inicio, inicio + tamanho)
    inicio += tamanho
    return { numero: indice + 1, jogadores }
  })
}
