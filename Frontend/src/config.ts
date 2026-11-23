export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

export function formatDate(value: string): string {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}
