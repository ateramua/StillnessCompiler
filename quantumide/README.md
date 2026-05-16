# QuantumIDE (StillnessCompiler)

QuantumIDE is the editor shell built from this repository’s `quantumide/` tree—a fork of the upstream open-source editor with StillnessCompiler–specific defaults (product identity, issue URLs, telemetry posture, and bundled configuration).

- **Source & issues:** [StillnessCompiler on GitHub](https://github.com/ateramua/StillnessCompiler) — [open an issue](https://github.com/ateramua/StillnessCompiler/issues/new) for bugs and feature requests.
- **License:** See the repository [LICENSE.txt](LICENSE.txt) (MIT).

## Fork documentation hub

Use this section as the **in-product “documentation” entry** (`documentationUrl` in `product.json`). Where behavior matches the upstream editor, we link to **canonical upstream docs** so instructions stay accurate; this page explains what belongs to **QuantumIDE / StillnessCompiler** vs. shared editor behavior.

### Workspace trust and restricted mode

Workspace trust controls whether the window treats opened folders as safe for automatic task execution, debugging, and extensions. For the full security model and UI behavior, see the **[workspace trust documentation](https://code.visualstudio.com/docs/editor/workspace-trust)** (upstream reference—the feature set is the same in this fork).

### Telemetry and diagnostics

This product build is configured with **telemetry disabled by default** in `product.json`. If you enable telemetry or crash reporting in settings, see **[Telemetry](https://code.visualstudio.com/docs/getstarted/telemetry)** for what categories of data mean in the upstream product (behavior is aligned here).

### UNC path access on Windows

Accessing UNC paths can require explicit host allowlisting. See **[UNC path documentation](https://code.visualstudio.com/docs/configure/unc)** for details.

### Editor compatibility reference

QuantumIDE keeps compatibility with the VS Code extension host and settings schema. For topics such as **glob patterns**, **hot exit**, **remote development**, and **language identifiers**, the upstream docs remain the most accurate references, for example:

- [Glob patterns & search / file excludes](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options)
- [Auto Save & Hot Exit](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save)
- [Remote development overview](https://code.visualstudio.com/docs/remote/remote-overview)
- [When clause contexts](https://code.visualstudio.com/docs/editor/when-clause-contexts)
- [Integrated terminal](https://code.visualstudio.com/docs/editor/integrated-terminal)
- [Extension bisect (troubleshooting)](https://code.visualstudio.com/blogs/2021/02/16/extension-bisect)

### GitHub Copilot in this fork

Copilot-related URLs in `product.json` point at **GitHub’s Copilot documentation** where appropriate, since Copilot is a GitHub product—not QuantumIDE-specific marketing pages.

## Introductory videos

Short walkthrough videos for editor basics (shared with the upstream product line): [Introductory videos](https://code.visualstudio.com/docs/getstarted/introvideos).

## Building and developing

See the parent repository and `quantumide/` build scripts (for example `npm run compile-check-ts-native`, Electron packaging, and `scripts/` helpers). For container-based development, see [.devcontainer/README.md](.devcontainer/README.md).

## Community

- **Issues & features:** [StillnessCompiler issues](https://github.com/ateramua/StillnessCompiler/issues)
- **Upstream editor** (compatibility reference): [VS Code documentation](https://code.visualstudio.com/docs)

---

*The remainder of this file previously mirrored the upstream Microsoft VS Code OSS README; it has been replaced with fork-oriented documentation. For historical upstream marketing text, see the Microsoft `vscode` repository.*
