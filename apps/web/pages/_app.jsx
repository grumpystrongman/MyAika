import Head from "next/head";
import { useEffect } from "react";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

function patchFetchCredentials() {
  if (typeof window === "undefined") return;
  if (window.__aikaFetchPatched) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const options = init || {};
    if (options.credentials === undefined) {
      options.credentials = "include";
    }
    return originalFetch(input, options);
  };
  window.__aikaFetchPatched = true;
}

export default function App({ Component, pageProps }) {
  useEffect(() => {
    patchFetchCredentials();
  }, []);
  return (
    <>
      <Head>
        <link rel="icon" type="image/png" href="/assets/aika/portraits/nocturne-human/favicon.png" />
        <link rel="preload" as="script" href="/vendor/draco/draco_decoder.js" />
        <link rel="preload" as="fetch" href="/vendor/draco/draco_decoder.wasm" crossOrigin="anonymous" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
