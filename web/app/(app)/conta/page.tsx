import { Lock, MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";

import { BOTAO_SECUNDARIO, Cabecalho, Cartao, IconeQuadro, Pagina } from "@/components/ui";
import { abasPersonalizadas, acessoTotal, nomeFuncao, PAGINAS_PARCIAIS, PERFIS } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { usuarios } from "@/lib/auth/usuarios";
import { GRUPOS } from "@/lib/navegacao";
import { acaoDesconectarTodos } from "./acoes";
import { FormularioSenha } from "./FormularioSenha";

export const metadata: Metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

export default async function MinhaConta() {
  const u = await exigir();
  const reg = u.demo ? null : (await usuarios())[u.login];
  const agora = new Date().toISOString();
  const aparelhos = (reg?.sessoes || []).filter((s) => (s.ate || "") > agora).length;
  const pers = abasPersonalizadas(u);
  const titulos = Object.fromEntries(GRUPOS.flatMap((g) => g.abas.map((a) => [a.id, a.titulo])));
  const vistas = acessoTotal(u) ? null : ["Estoque", ...(pers ? [...pers].filter((p) => p !== "estoque" && titulos[p]).map((p) => titulos[p]) : []),
    ...Object.entries(PAGINAS_PARCIAIS).filter(([p]) => !pers?.has(p)).map(([, t]) => `${t} (Equipamentos)`)];
  const dados = [["Nome", u.nome || "—"], ["Usuário (NP)", u.login], ["Função", nomeFuncao(u)], ["Perfil", PERFIS[u.perfil || ""] || "Leitor"]];

  return (
    <Pagina>
      <Cabecalho titulo="Minha conta," destaque="seus dados e sua senha." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dados.map(([r, v]) => (
          <div key={r} className="rounded-cartao border border-borda bg-superficie-2 p-5">
            <div className="text-[12.5px] text-texto-3">{r}</div>
            <div className="mt-1 font-display text-[17px] font-medium">{v}</div>
          </div>
        ))}
      </div>
      {vistas && (
        <div className="flex gap-3 rounded-cartao border border-borda bg-superficie-2 px-4 py-3 text-[13.5px] text-texto-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-texto-3" />
          <span>Você vê as abas: <b>{vistas.join(" · ")}</b>. Para mudar, peça a um administrador.</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Cartao className="p-6">
          <div className="mb-5 font-display text-[17px] font-medium">Trocar senha</div>
          {u.demo ? <p className="text-[14px] text-texto-3">Na demonstração não há senha.</p> : <FormularioSenha pedirAtual />}
        </Cartao>
        <Cartao className="p-6">
          <IconeQuadro icone={MonitorSmartphone} tom="azul" />
          <div className="mt-4 font-display text-[17px] font-medium">Aparelhos conectados</div>
          <p className="mt-1 text-[13.5px] text-texto-3">{aparelhos} aparelho(s) com sessão ativa.</p>
          {aparelhos > 0 && (
            <form action={acaoDesconectarTodos} className="mt-5">
              <button className={BOTAO_SECUNDARIO}>Desconectar todos os aparelhos</button>
            </form>
          )}
        </Cartao>
      </div>
    </Pagina>
  );
}
