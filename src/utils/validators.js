/**
 * validators.js — Validações de entrada no cliente.
 * Importante: validação no cliente é UX, não segurança.
 * A barreira real é o firestore.rules + Cloud Functions.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email) {
  return EMAIL_RE.test((email || '').trim())
}

/** Valida CPF com dígitos verificadores (não apenas formato). */
export function isValidCPF(raw) {
  const cpf = (raw || '').replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false // 111.111.111-11 etc.

  const calcDigit = (slice) => {
    let sum = 0
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (slice.length + 1 - i)
    }
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return calcDigit(cpf.slice(0, 9)) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10)) === Number(cpf[10])
}

/** Formata CPF para exibição: 000.000.000-00 */
export function formatCPF(raw) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** Telefone BR: 10 ou 11 dígitos (com DDD). */
export function isValidPhone(raw) {
  const d = (raw || '').replace(/\D/g, '')
  return d.length === 10 || d.length === 11
}

/** Formata telefone: (00) 00000-0000 */
export function formatPhone(raw) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

/**
 * Política de senha: mínimo 8 caracteres com pelo menos
 * uma letra e um número. Retorna null se ok, ou a mensagem de erro.
 */
export function passwordIssue(password) {
  const pw = password || ''
  if (pw.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[a-zA-Z]/.test(pw)) return 'A senha deve conter pelo menos uma letra.'
  if (!/\d/.test(pw)) return 'A senha deve conter pelo menos um número.'
  return null
}

/**
 * CRMV: registro no Conselho Regional de Medicina Veterinária.
 * Formato aceito: UF + 3 a 6 dígitos (ex: "RS 12345", "SP-1234").
 * IMPORTANTE: isto valida apenas o FORMATO. O CFMV não disponibiliza
 * API pública; a confirmação de que o registro existe e está ativo
 * deve ser feita manualmente em https://siscad.cfmv.gov.br/paginas/busca
 * (campo crmvVerified controlado pelo admin).
 */
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function isValidCRMV(raw) {
  const m = /^([A-Za-z]{2})[\s\-]?(\d{3,6})$/.exec((raw || '').trim())
  if (!m) return false
  return UFS.includes(m[1].toUpperCase())
}

/** Normaliza para "UF 12345" enquanto digita. */
export function formatCRMV(raw) {
  const v = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  if (v.length <= 2) return v
  return v.slice(0, 2) + ' ' + v.slice(2)
}
