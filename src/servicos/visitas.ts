type Armazenamento = Pick<Storage, 'getItem' | 'setItem'> | Map<string, string>

const CHAVE_TOTAL = 'futplay:visitas-navegador'
const CHAVE_SESSAO = 'futplay:visita-registrada'

const ler = (armazenamento: Armazenamento, chave: string) =>
  armazenamento instanceof Map ? armazenamento.get(chave) ?? null : armazenamento.getItem(chave)

const gravar = (armazenamento: Armazenamento, chave: string, valor: string) => {
  if (armazenamento instanceof Map) armazenamento.set(chave, valor)
  else armazenamento.setItem(chave, valor)
}

/** Conta uma visita por sessão neste navegador; não representa tráfego global. */
export function registrarVisita(armazenamento: Armazenamento, sessao: Armazenamento): number {
  const atual = Number(ler(armazenamento, CHAVE_TOTAL) ?? '0')
  if (ler(sessao, CHAVE_SESSAO)) return Number.isSafeInteger(atual) && atual > 0 ? atual : 1
  const proximo = Number.isSafeInteger(atual) && atual >= 0 ? atual + 1 : 1
  gravar(armazenamento, CHAVE_TOTAL, String(proximo))
  gravar(sessao, CHAVE_SESSAO, '1')
  return proximo
}
