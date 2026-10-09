/**
 * Nome da cidade a partir da coordenada.
 *
 * Serve para o veterinário CONFERIR a localização que marcou ("Uberlândia,
 * MG" diz mais que dois números) e para o quadro "Onde está sua base" do
 * admin, que agrupa por cidade.
 *
 * Usa o Nominatim (OpenStreetMap), o mesmo dono dos mapas que o app já
 * carrega. Uma consulta por cadastro, bem abaixo do limite de uso deles.
 * Nunca é obrigatório: se falhar ou demorar, a coordenada vale sozinha.
 */
export async function cidadeDe(lat, lng, { esperaMs = 5000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), esperaMs)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=pt-BR`
      + `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    const a = (await r.json())?.address || {}
    const cidade = a.city || a.town || a.village || a.municipality || null
    // "BR-MG" -> "MG"
    const uf = (a['ISO3166-2-lvl4'] || '').split('-')[1] || null
    return cidade ? { cidade, uf } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
