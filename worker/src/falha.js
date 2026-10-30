/** Erro com status HTTP e mensagem que pode ir direto para a pessoa. */
export class Falha extends Error {
  constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo }
}
