import type { Metadata } from "next";

import { exigir } from "@/lib/auth/sessao";

import { armarioDoQr, EscolherArmario } from "../_armario";
import { FormRetirada } from "../Formularios";

export const metadata: Metadata = { title: "Retirada · UBM" };
export const dynamic = "force-dynamic";

/** Formulário do QR de retirada do armário kanban (?u=<id do armário>), feito para o celular. */
export default async function RetiradaUbm(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("ubm");
  const a = await armarioDoQr((await props.searchParams).u);
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-5 sm:py-10">
      {a ? <><h1 className="sr-only">Retirada de material da UBM</h1><FormRetirada armario={a} /></>
        : <EscolherArmario rota="/ubm/retirada" titulo="Retirada de material" />}
    </div>
  );
}
