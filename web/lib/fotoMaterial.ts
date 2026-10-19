/**
 * Endereço da foto de um material (a referência `foto` do cadastro de materiais). Foto nova: `?v=` é a versão do
 * conteúdo (cache longo no navegador) e `mini` pede a miniatura (só quando foi gravada). Foto do site antigo
 * (`fotos_materiais/…`): `v=legado`, sem miniatura. Usado no navegador e no servidor.
 */
export function urlFotoMaterial(material: string, ref: unknown, mini = false): string | null {
  const r = typeof ref === "string" ? ref : "";
  const m = encodeURIComponent(material);
  if (r.startsWith("app/fotos/materiais/")) {
    const q = new URLSearchParams(r.split("?")[1] ?? "");
    const comMini = mini && q.get("mini") === "1";
    return `/api/estoque/foto?m=${m}&v=${encodeURIComponent(q.get("v") ?? "")}${comMini ? "&mini=1" : ""}`;
  }
  if (/^fotos_materiais\/[0-9A-Za-z_-]+\.jpg$/.test(r)) return `/api/estoque/foto?m=${m}&v=legado`;
  return null;
}
