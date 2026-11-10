import type { Metadata } from "next";

import { Aviso } from "@/components/PaginaWcm";
import { Cabecalho, Pagina } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";

export const metadata: Metadata = { title: "Cadastro de material" };
export const dynamic = "force-dynamic";

/** Provisória: a tela completa (pedidos, aprovações e fotos) entra na próxima etapa. */
export default async function CadastroMaterial() {
  await exigir("cadastro_material");
  return (
    <Pagina>
      <Cabecalho titulo="Cadastro de material," destaque="do pedido à validação na chegada." sobre="Custos e suprimentos" />
      <Aviso tom="azul">A tela dos pedidos de cadastro de material está em preparação.</Aviso>
    </Pagina>
  );
}
