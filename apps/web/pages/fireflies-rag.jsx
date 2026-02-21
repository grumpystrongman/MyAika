import { useEffect } from "react";

export default function FirefliesRagPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.location.replace("/?tab=fireflies");
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
      Redirecting to Fireflies...
    </div>
  );
}
