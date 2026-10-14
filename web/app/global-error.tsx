"use client";

/** Falha no layout raiz (raro): página mínima, sem depender do CSS do site, com "Tentar de novo". */
export default function ErroGeral({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <title>Central de Manutenção</title>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>O site não carregou</h1>
          <p style={{ fontSize: 14, opacity: 0.75 }}>
            Pode ser uma instabilidade momentânea. Tente de novo{error.digest ? ` (código ${error.digest})` : ""}.
          </p>
          <button type="button" onClick={() => retry()}
            style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #888", background: "transparent", cursor: "pointer" }}>
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
