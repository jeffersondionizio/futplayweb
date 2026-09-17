/**
 * Distância entre dois pontos, no navegador.
 *
 * O cálculo mora aqui e não no backend de propósito: `grupoPublico` já devolve
 * `latitude` e `longitude`, então o cliente tem tudo para medir. Fazer isso no
 * servidor obrigaria uma requisição a cada ajuste do raio, e o resultado seria
 * o mesmo número.
 *
 * Haversine assume a Terra esférica. O erro contra o elipsoide fica abaixo de
 * 0,5%, o que numa pelada a 8 km significa 40 metros — irrelevante para decidir
 * se dá para ir a pé.
 */

const RAIO_TERRA_KM = 6371
const rad = (g: number) => (g * Math.PI) / 180

export type Ponto = { lat: number; lon: number }

/** Lê lat/long que a API manda como string. `0` é o default de quem nunca marcou. */
export function pontoDe(latitude?: string, longitude?: string): Ponto | null {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat === 0 && lon === 0) return null
  return { lat, lon }
}

export function distanciaKm(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(h))
}

/** "850 m", "3,2 km", "14 km" — a precisão cai conforme a distância cresce. */
export function formatarDistancia(km: number, locale = 'pt-BR'): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  const casas = km < 10 ? 1 : 0
  return `${km.toLocaleString(locale, { minimumFractionDigits: casas, maximumFractionDigits: casas })} km`
}

/**
 * Posição do navegador.
 *
 * Resolve com `null` em vez de rejeitar quando o usuário recusa ou o aparelho
 * não responde: recusar permissão é escolha legítima, não erro de tela. Quem
 * chama cai na busca por cidade.
 */
export function minhaPosicao(timeoutMs = 8000): Promise<Ponto | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    )
  })
}
