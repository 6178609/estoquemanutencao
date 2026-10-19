import type { Metadata } from "next";
import Link from "next/link";

import { RETENCAO_DIAS } from "@/lib/auditoria";
import { INATIVIDADE_MIN } from "@/lib/auth/inatividade";

export const metadata: Metadata = { title: "Privacidade" };

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="font-display text-[18px] font-medium text-texto">{titulo}</h2>
    <div className="space-y-2 text-[14.5px] leading-relaxed text-texto-2">{children}</div>
  </section>
);

const DADOS: [string, string, string][] = [
  ["Cadastro de usuário", "NP, nome, função, perfil, abas liberadas, e-mail (opcional), situação e último acesso", "Enquanto a pessoa tiver acesso; sai quando o administrador exclui o usuário"],
  ["Senha", "Só o resumo criptográfico (hash) — a senha em si nunca é guardada nem vista por ninguém", "Até a próxima troca"],
  ["Sessões (aparelhos conectados)", "Resumo do token de cada aparelho e a validade", `Até a validade (12 horas, ou 30 dias com “manter conectado”); a sessão deixa de valer após ${INATIVIDADE_MIN} min sem uso`],
  ["Pedido de acesso", "NP, nome, função pedida, motivo e a decisão do administrador", "Até a decisão; os decididos ficam como registro"],
  ["Trilha de auditoria", "Quem fez cada ação importante (entrar, sair, trocar senha, mexer em usuários, enviar base, baixar planilha, alocar peças) e quando", `${Math.round(RETENCAO_DIAS / 30)} meses; depois é apagada sozinha`],
  ["Equipe, treinamentos e férias (Gestão de HH)", "NP, nome, cargo, área, treinamentos e períodos de férias cadastrados pelos líderes", "Enquanto a pessoa fizer parte da equipe"],
  ["Histórico dos cadastros", "Versões anteriores de cada cadastro, com quem alterou", "Cópia de segurança para desfazer erros"],
];

/** Política de privacidade (LGPD): o que o site guarda, para quê, por quanto tempo e como pedir acesso, correção ou exclusão. */
export default function Privacidade() {
  return (
    <div className="min-h-dvh bg-fundo">
      <header className="border-b border-borda">
        <div className="mx-auto flex h-16 max-w-[900px] items-center gap-3 px-4 sm:px-8">
          <Link href="/" className="font-display text-[15px] font-medium tracking-[-0.02em] text-texto">Central de Manutenção</Link>
          <span className="text-[12px] text-texto-3">Privacidade</span>
        </div>
      </header>
      <main className="mx-auto max-w-[900px] space-y-8 px-4 py-10 sm:px-8">
        <div className="space-y-2">
          <h1 className="font-display text-[30px] font-medium tracking-[-0.02em] text-texto">Privacidade e dados pessoais</h1>
          <p className="text-[15px] text-texto-3">Como a Central de Manutenção trata os dados das pessoas que usam o site, de acordo com a LGPD (Lei 13.709/2018).</p>
        </div>

        <Secao titulo="Para que serve">
          <p>O site é uma ferramenta interna de trabalho da manutenção: estoque, ativos, ordens e indicadores. Os dados pessoais servem só para
            controlar quem acessa, o que cada função pode ver e alterar, planejar a mão de obra da equipe e registrar quem fez cada alteração
            (segurança e rastreabilidade). Nada é vendido, compartilhado com terceiros para outros fins ou usado para publicidade.</p>
        </Secao>

        <Secao titulo="O que é guardado e por quanto tempo">
          <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
            <table className="w-full min-w-[620px] text-left text-[13.5px]">
              <thead className="border-b border-borda bg-superficie-2 text-[12px] text-texto-3">
                <tr>{["Dado", "O quê", "Por quanto tempo"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-borda divide-y">
                {DADOS.map(([d, o, t]) => (
                  <tr key={d}><th scope="row" className="px-4 py-2.5 font-medium text-texto">{d}</th><td className="px-4 py-2.5">{o}</td><td className="px-4 py-2.5 text-texto-3">{t}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>As bases do SAP enviadas em Fontes de dados podem trazer nomes e NPs de quem abriu ou executou as ordens; elas são usadas só nos indicadores
            do site e trocadas a cada novo envio.</p>
        </Secao>

        <Secao titulo="Onde os dados ficam">
          <p>O site roda na Vercel (servidores em São Paulo). Os cadastros e a trilha de auditoria ficam num banco Postgres do Supabase, também em São Paulo,
            e as bases do SAP num repositório privado. Só o servidor do site tem a chave de acesso; a comunicação é sempre criptografada (HTTPS).</p>
        </Secao>

        <Secao titulo="Cookies">
          <p>Só os essenciais para o site funcionar, sem rastreamento nem publicidade: a sessão de quem entrou, a hora da última atividade (para sair
            sozinho após {INATIVIDADE_MIN} minutos sem uso), os filtros escolhidos nas telas, um aviso de base recém-enviada e um identificador do navegador
            que limita pedidos de acesso repetidos.</p>
        </Secao>

        <Secao titulo="Seus direitos">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>Ver os seus dados:</b> em <Link href="/conta" className="underline">Minha conta</Link>, “Baixar meus dados” gera um arquivo com o seu cadastro, o que você fez e o que foi feito no seu usuário (registros de auditoria).</li>
            <li><b>Corrigir:</b> nome, função ou e-mail errados — peça a um administrador do site (aba Usuários).</li>
            <li><b>Excluir ou revogar o acesso:</b> peça a um administrador; o usuário é excluído e as sessões encerradas na hora. Os registros de auditoria
              continuam até o fim do prazo acima, por segurança.</li>
            <li><b>Dúvidas e reclamações:</b> fale com a liderança da manutenção ou com o canal de privacidade (Encarregado de dados) da empresa.</li>
          </ul>
        </Secao>

        <p className="border-t border-borda pt-4 text-[12.5px] text-texto-4">Atualizada em outubro de 2026.</p>
      </main>
    </div>
  );
}
