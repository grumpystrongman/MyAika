import { useEffect } from "react";

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
  return <Component {...pageProps} />;
}
