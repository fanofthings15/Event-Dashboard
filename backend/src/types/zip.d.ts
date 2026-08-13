// Ambient module declaration so TypeScript accepts importing a .zip file as a
// file-path string. This is only meaningful under Bun's `with { type: "file" }`
// import attribute (used to embed the built frontend into a compiled .exe).
// The import in index.ts is a static top-level import — Bun's compiler needs
// it to be statically analyzable to know which file to bake into the .exe —
// so it's always evaluated on module load, even when not running as a
// compiled exe. That's why backend/ui-dist.zip is committed as a placeholder:
// without SOME file at that path, even `bun run dev` would fail to start.
declare module "*.zip" {
  const path: string;
  export default path;
}
