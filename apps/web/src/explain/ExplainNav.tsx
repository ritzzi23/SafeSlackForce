import { PROJECT_NAME } from "../branding";

export default function ExplainNav({ current }: { current: "design" | "presentation" }) {
  return (
    <nav className="explain-nav" aria-label="Project pages">
      <a className="explain-brand" href="#">{PROJECT_NAME}</a>
      <div className="explain-links">
        <a href="#">Workspace</a>
        <a href="#system-design" aria-current={current === "design" ? "page" : undefined}>System design</a>
        <a href="#presentation" aria-current={current === "presentation" ? "page" : undefined}>Presentation</a>
        <a href="https://github.com/ritzzi23/SafeSlackForce" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </nav>
  );
}
