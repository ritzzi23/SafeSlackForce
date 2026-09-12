import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App";
const SystemDesign = lazy(() => import("./explain/SystemDesign"));
const Presentation = lazy(() => import("./explain/Presentation"));

/** Hash routes keep the static build host-agnostic (Vercel, vite preview) with no rewrite rules. */
export default function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = hash === "#system-design" ? "SafeSlackForce · System design" : hash === "#presentation" ? "SafeSlackForce · Presentation" : "SafeSlackForce";
  }, [hash]);
  if (hash === "#system-design" || hash === "#presentation") {
    return <Suspense fallback={null}>{hash === "#system-design" ? <SystemDesign /> : <Presentation />}</Suspense>;
  }
  return <App />;
}
