'use client';
export default function GlobalError({ retry }: {
  error: unknown;
  retry: () => void;
}) {
  return <html lang="tr"><body><main role="alert"><h1>Ekran yüklenemedi</h1><p>Yeniden deneyin; sorun sürerse destek ekibine başvurun.</p><button type="button" onClick={retry}>Tekrar dene</button></main></body></html>;
}
