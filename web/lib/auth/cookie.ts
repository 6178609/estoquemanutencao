/** Nome do cookie de sessão. Em produção o prefixo __Host- obriga Secure + Path=/ + sem Domain: nenhum subdomínio planta o cookie. */
export const COOKIE_SESSAO = process.env.NODE_ENV === "production" ? "__Host-cmw_sessao" : "cmw_sessao";
