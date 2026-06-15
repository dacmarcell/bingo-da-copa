import { useEffect, useMemo } from "react";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdsenseBanner() {
  const adClient = useMemo(() => "ca-pub-4802566656473554", []);
  //TODO: atualizar slot id quando for aprovado no adsense
  const adSlot = useMemo(() => "SEU_SLOT_ID", []);

  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error(err);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={adClient}
      data-ad-slot={adSlot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
