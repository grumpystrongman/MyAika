import Head from "next/head";
import TradingPanel from "../src/components/TradingPanel";

function resolveServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return "";
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
