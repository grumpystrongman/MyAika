import Head from "next/head";
import SignalsPanel from "../src/components/SignalsPanel";

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

