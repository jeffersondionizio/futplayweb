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

/** Sorteia times sem ultrapassar a lotação; quem sobra forma o próximo time. */
export function sortearTimes(nomes: string[], jogadoresPorTime: number, aleatorio = Math.random): TimeSorteado[] {
  if (nomes.length < 2 || !Number.isInteger(jogadoresPorTime) || jogadoresPorTime < 1) return []
  const embaralhados = [...nomes]
  for (let indice = embaralhados.length - 1; indice > 0; indice -= 1) {
    const alvo = Math.floor(aleatorio() * (indice + 1))
    ;[embaralhados[indice], embaralhados[alvo]] = [embaralhados[alvo], embaralhados[indice]]
  }
  const quantidadeTimesCheios = Math.floor(embaralhados.length / jogadoresPorTime)
  const sobra = embaralhados.length % jogadoresPorTime
  const times = Array.from({ length: quantidadeTimesCheios }, (_, indice) => ({
    numero: indice + 1,
    jogadores: embaralhados.slice(indice * jogadoresPorTime, (indice + 1) * jogadoresPorTime),
  }))
  if (sobra) times.push({ numero: times.length + 1, jogadores: embaralhados.slice(quantidadeTimesCheios * jogadoresPorTime) })
  return times
}
