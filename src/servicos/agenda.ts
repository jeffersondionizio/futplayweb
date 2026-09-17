import type { Grupo } from './api'

export type CompromissoAgenda = { grupo: Grupo; quando: Date | null }

const dias: Record<string, number> = {
  domingo: 0, sunday: 0,
  segunda: 1, monday: 1,
  terca: 2, tuesday: 2,
  quarta: 3, wednesday: 3,
  quinta: 4, thursday: 4,
  sexta: 5, friday: 5,
  sabado: 6, saturday: 6,
}

const normalizar = (valor: string) => valor
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/-feira$/, '')

const horario = (valor: string) => {
  const resultado = /^(\d{1,2}):(\d{2})$/.exec(valor.trim())
  if (!resultado) return null
  const horas = Number(resultado[1])
  const minutos = Number(resultado[2])
  return horas <= 23 && minutos <= 59 ? { horas, minutos } : null
}

/** Converte data pontual (dd/MM/aaaa) ou dia recorrente no próximo horário futuro. */
export function proximoHorario(data: string, hora: string, agora = new Date()): Date | null {
  const tempo = horario(hora)
  if (!tempo) return null

  const dataExplicita = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim())
  if (dataExplicita) {
    const resultado = new Date(Number(dataExplicita[3]), Number(dataExplicita[2]) - 1, Number(dataExplicita[1]), tempo.horas, tempo.minutos)
    // Date aceita 31/02 e avança o mês; conferimos os campos para rejeitar a data inexistente.
    if (resultado.getFullYear() !== Number(dataExplicita[3]) || resultado.getMonth() !== Number(dataExplicita[2]) - 1 || resultado.getDate() !== Number(dataExplicita[1])) return null
    return resultado > agora ? resultado : null
  }

  const dia = dias[normalizar(data)]
  if (dia === undefined) return null
  const resultado = new Date(agora)
  resultado.setHours(tempo.horas, tempo.minutos, 0, 0)
  const diferenca = (dia - resultado.getDay() + 7) % 7
  resultado.setDate(resultado.getDate() + diferenca)
  if (resultado <= agora) resultado.setDate(resultado.getDate() + 7)
  return resultado
}

export function ordenarAgenda(grupos: Grupo[], agora = new Date()): CompromissoAgenda[] {
  return grupos
    .map((grupo) => ({ grupo, quando: proximoHorario(grupo.data_peladaproxima || grupo.dia_semana || '', grupo.hora_inicio || '', agora) }))
    .sort((a, b) => (a.quando?.getTime() ?? Infinity) - (b.quando?.getTime() ?? Infinity))
}
