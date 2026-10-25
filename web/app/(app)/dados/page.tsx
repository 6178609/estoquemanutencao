import { CheckCircle2, CircleDashed, Clock } from "lucide-react";
import type { Metadata } from "next";

import { Cabecalho, Cartao, IconeQuadro, Pagina, Pilula, Selo } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { manifesto, type InfoBase } from "@/lib/dados/bases";
import { fonte, modo } from "@/lib/dados/fonte";
import { dataHora, idade, inteiro } from "@/lib/formato";
import { DESTINO, NOMES_BASE, TIPOS } from "@/lib/leitura/tipos";
import { Envio } from "./Envio";
import { ImportarFotos } from "./ImportarFotos";
import { FotosAutomaticas } from "./FotosAutomaticas";
import { resumoFotosAutomaticas } from "@/lib/fotos/rodadaFotos";

export const metadata: Metadata = { title: "Fontes de dados" };
export const dynamic = "force-dynamic";

const DIAS_ALERTA = 2; // base mais velha que isso aparece como desatualizada

export default async function FontesDeDados() {
  const u = await exigir("dados");
  const f = fonte();
  const [man, versoes]: [Record<string, InfoBase>, Map<string, string>] = f
    ? await f.versoes(true).then(async (v) => [await manifesto(), v] as [Record<string, InfoBase>, Map<string, string>])
    : [{}, new Map<string, string>()];
  const agora = Date.now();
  const bases = TIPOS.map((tipo) => {
    const caminho = DESTINO[tipo];
    const info = man[caminho] || {};
    const arquivos = info.partes?.length ? info.partes : [caminho];
    const carregada = arquivos.every((a) => versoes.has(a));
    const quando = info.modificado ? Date.parse(info.modificado) : NaN;
    const velha = carregada && Number.isFinite(quando) && agora - quando > DIAS_ALERTA * 86_400_000;
    return { tipo, nome: NOMES_BASE[tipo], info, carregada, velha };
  });
  const carregadas = bases.filter((b) => b.carregada).length;
  const fotos = await resumoFotosAutomaticas();

  return (
    <Pagina>
      <Cabecalho titulo="Fontes de dados," destaque="os exports do SAP num lugar só."
        sobre={<Pilula>{modo() === "demo" ? "Demonstração" : `${carregadas} de ${bases.length} bases carregadas`}</Pilula>}
        subtitulo="Anexe os exports (IW38, MB52, IW28, IH08, IP19, IW47, requisições, Sysmat, Gestão de HH, Gerenciador de AF). O site reconhece cada base pelos cabeçalhos, compacta no seu navegador e grava no repositório de dados — vale sempre o envio mais recente." />

      <FotosAutomaticas resumo={fotos} pode={podeEditar(u)} />

      {podeEditar(u) && <ImportarFotos />}

      {podeEditar(u) ? <Envio demo={modo() === "demo"} />
        : <p className="text-[14px] text-texto-3">Só editores e administradores enviam bases. Peça a um deles para atualizar.</p>}

      <section className="space-y-4">
        <div className="font-display text-[20px] font-medium">Bases no repositório</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bases.map((b) => (
            <Cartao key={b.tipo} className="p-5">
              <div className="flex items-start gap-3">
                <IconeQuadro icone={!b.carregada ? CircleDashed : b.velha ? Clock : CheckCircle2}
                  tom={!b.carregada ? "neutro" : b.velha ? "laranja" : "verde"} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[15px] font-medium leading-snug">{b.nome}</div>
                  {b.carregada ? (
                    <div className="mt-1.5 space-y-0.5 text-[12.5px] text-texto-3">
                      <div>
                        {b.info.modificado ? <>Export de <b className="text-texto-2">{dataHora(b.info.modificado)}</b> · {idade(b.info.modificado)}</> : "Data do export desconhecida"}
                        {b.velha && <Selo cor="laranja" className="ml-1.5">desatualizada</Selo>}
                      </div>
                      {b.info.linhas !== undefined && <div>{inteiro(b.info.linhas)} linhas</div>}
                      {b.info.origem && <div className="truncate" title={b.info.origem}>{b.info.origem}</div>}
                      <div>
                        {b.info.enviado_por && <>Enviado por {b.info.enviado_por}</>}
                        {b.info.enviado_em && <> · {dataHora(b.info.enviado_em)}</>}
                      </div>
                    </div>
                  ) : <div className="mt-1.5 text-[12.5px] text-texto-4">Ainda não enviada</div>}
                </div>
              </div>
            </Cartao>
          ))}
        </div>
      </section>
    </Pagina>
  );
}
