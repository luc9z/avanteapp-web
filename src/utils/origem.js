/**
 * De onde veio cada cadastro.
 *
 * Sem isto não dá para saber se o vídeo do Instagram, o grupo de
 * WhatsApp ou a palestra na faculdade trouxe gente. A visita chega com
 * marcações na URL (?utm_source=instagram, ?ref=ANA8421) e a conta só
 * é criada depois, às vezes em outra tela ou em outro dia. Por isso a
 * origem fica guardada no navegador desde a primeira visita e só vai
 * para o banco quando a conta nasce.
 *
 * Só lógica pura aqui, sem Firebase, para poder testar em node
 * (npm run test:origem). A gravação fica em services/origem.js.
 */

export const CHAVE_ORIGEM = 'avante-origem'

const CAMPOS_UTM = ['utm_source', 'utm_medium', 'utm_campaign']

/**
 * Valor de URL vira dado de banco: corta tamanho e caracteres. Sem isso
 * qualquer um gravava texto arbitrário no documento de quem se cadastra.
 */
function limpar(v, max = 40) {
  if (!v) return null
  const s = String(v).trim().slice(0, max).replace(/[^A-Za-z0-9_.-]/g, '')
  return s || null
}

/** Caminho da página: como limpar(), mas mantém as barras. */
function limparCaminho(v) {
  const s = String(v || '').slice(0, 60).replace(/[^A-Za-z0-9/_.-]/g, '')
  return s.startsWith('/') ? s : '/'
}

/** Código de indicação: só letras e números, sempre em maiúsculas. */
export function limparCodigo(v) {
  const s = (limpar(v, 12) || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.length >= 4 ? s : null
}

/** Lê as marcações de uma query string. Devolve null se não há nenhuma. */
export function lerMarcacoes(search) {
  const p = new URLSearchParams(search || '')
  const m = { ref: limparCodigo(p.get('ref')) }
  for (const c of CAMPOS_UTM) m[c] = limpar(p.get(c))?.toLowerCase() || null
  return Object.values(m).some(Boolean) ? m : null
}

/**
 * Junta uma visita nova com a origem já guardada.
 *
 * Canal (utm) é da PRIMEIRA visita: quem chegou pelo Instagram e
 * voltou dias depois digitando o endereço veio do Instagram.
 * Indicação (ref) é da ÚLTIMA: um link de colega é pedido explícito, e
 * é ele que gera o mês grátis para quem indicou.
 */
export function juntarOrigem(guardada, nova, pagina, agora = new Date().toISOString()) {
  if (!nova) return guardada || null
  if (!guardada) return { ...nova, pagina: limparCaminho(pagina), em: agora }
  const r = { ...guardada }
  for (const c of CAMPOS_UTM) if (!r[c] && nova[c]) r[c] = nova[c]
  if (nova.ref) r.ref = nova.ref
  return r
}

/** O que vai para o documento do usuário. Nunca devolve campo vazio. */
export function origemParaGravar(guardada) {
  if (!guardada) return { canal: 'direto' }
  const r = { canal: canalDe(guardada) }
  for (const k of ['ref', ...CAMPOS_UTM, 'pagina', 'em', 'intencao']) {
    if (guardada[k]) r[k] = guardada[k]
  }
  return r
}

/**
 * Nome do canal para relatório. Indicação vence utm: o link de colega
 * pode carregar utm_source=whatsapp, mas o que trouxe a pessoa foi o
 * colega.
 */
export function canalDe(o) {
  if (!o) return 'direto'
  if (o.ref) return 'indicacao'
  return o.utm_source || 'direto'
}

const NOMES_CANAL = {
  indicacao: 'Indicação de colega',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  google: 'Google',
  faculdade: 'Faculdade',
  evento: 'Evento',
  direto: 'Direto, sem marcação',
}

export function nomeDoCanal(canal) {
  if (!canal) return 'Antes da medição'
  return NOMES_CANAL[canal] || canal.charAt(0).toUpperCase() + canal.slice(1)
}

/** Link marcado para divulgação. */
export function montarLink(base, { canal, meio, campanha, ref } = {}) {
  const u = new URL('/conheca', base)
  const c = limpar(canal)?.toLowerCase()
  const m = limpar(meio)?.toLowerCase()
  const k = limpar(campanha)?.toLowerCase()
  const r = limparCodigo(ref)
  if (c) u.searchParams.set('utm_source', c)
  if (m) u.searchParams.set('utm_medium', m)
  if (k) u.searchParams.set('utm_campaign', k)
  if (r) u.searchParams.set('ref', r)
  return u.toString()
}
