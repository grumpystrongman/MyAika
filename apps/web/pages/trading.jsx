import Head from "next/head";
import TradingPanel from "../src/components/TradingPanel";

function isLocalhostUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function resolveServerUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL || "";
  if (typeof window !== "undefined") {
    const origin = window.location.origin || "";
    if (!envUrl) return origin;
    if (origin && isLocalhostUrl(envUrl) && !isLocalhostUrl(origin)) {
      return origin;
    }
  }
  return envUrl;
}

const SERVER_URL = resolveServerUrl();

export default function TradingPage() {
  return (
    <>
      <Head>
        <title>Aika Trading Terminal</title>
      </Head>
      <TradingPanel serverUrl={SERVER_URL} fullPage />
    </>
  );
}
