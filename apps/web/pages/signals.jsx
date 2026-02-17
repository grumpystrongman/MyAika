import Head from "next/head";
import SignalsPanel from "../src/components/SignalsPanel";

function resolveServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return "";
}

const SERVER_URL = resolveServerUrl();

export default function SignalsPage() {
  return (
    <>
      <Head>
        <title>Aika Signals Monitor</title>
      </Head>
      <SignalsPanel serverUrl={SERVER_URL} fullPage />
    </>
  );
}

