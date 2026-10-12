/** Aparece na hora em que se clica numa aba, enquanto o servidor monta a página (esqueleto no formato das telas). */
export default function Carregando() {
  const bloco = "animate-pulse rounded-cartao bg-superficie-2";
  return (
    <div role="status" aria-label="Carregando" className="mx-auto w-full max-w-[1240px] space-y-10 px-4 py-8 sm:px-8 sm:py-12">
      <div className="space-y-4">
        <div className="h-7 w-40 animate-pulse rounded-full bg-superficie-2" />
        <div className="h-12 w-full max-w-2xl animate-pulse rounded-xl bg-superficie-2" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-superficie-2" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${bloco} h-28`} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${bloco} h-72`} />
        <div className={`${bloco} h-72`} />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
