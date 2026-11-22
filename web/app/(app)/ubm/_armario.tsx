import Link from "next/link";

import { armario as lerArmario, lerArmarios } from "@/lib/ubm/dados";

import type { ArmarioTela } from "./Formularios";

/** O armário do QR (?u=) para os formulários do celular; sem ele, a lista dos armários ativos para escolher. */
export async function armarioDoQr(u: string | string[] | undefined): Promise<ArmarioTela | null> {
  const a = await lerArmario(String(Array.isArray(u) ? u[0] : u ?? ""), true);
  return a && a.ativo ? { id: a.id, nome: a.nome, local: a.local, itens: a.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, um: i.um })) } : null;
}

export async function EscolherArmario({ rota, titulo }: { rota: string; titulo: string }) {
  const arms = (await lerArmarios()).filter((a) => a.ativo);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em]">{titulo}</h1>
      <p className="text-[14px] text-texto-3">Armário não encontrado ou desativado. Leia de novo o QR code colado no armário kanban ou escolha abaixo.</p>
      <ul className="grid gap-2">
        {arms.map((a) => (
          <li key={a.id}>
            <Link href={`${rota}?u=${encodeURIComponent(a.id)}`} className="flex min-h-12 items-center rounded-xl border border-borda bg-superficie px-4 py-3 text-[15px] hover:bg-superficie-2">
              <span className="num font-medium">{a.id}</span>&nbsp;· {a.nome}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
