import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdsenseBanner() {
  const { isSubscriber } = useAuth();

  useEffect(() => {
    // Don't load ads for subscribers
    if (isSubscriber) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error(err);
    }
  }, [isSubscriber]);

  // Don't render ads for subscribers
  if (isSubscriber) return null;

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client="ca-pub-4802566656473554"
      data-ad-slot="3593341204"
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
