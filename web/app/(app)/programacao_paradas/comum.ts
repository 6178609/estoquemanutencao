/** Formatação comum das visões da Programação de paradas (cliente e servidor). */
export const h = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesBr = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
export const ddmmaaaa = (d: number) => {
  const x = new Date(d * 86_400_000);
  return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
};
export const mesDoDia = (d: number) => { const x = new Date(d * 86_400_000); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
