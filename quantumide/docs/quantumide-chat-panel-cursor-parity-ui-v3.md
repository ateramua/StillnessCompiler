# QuantumIDE Chat Panel — Cursor parity UI (v3 spec)

This document maps the **“QuantumIDE Chat Panel: Development Requirements for Cursor-Level Parity”** checklist (workspace through advanced AI workflows) to concrete QuantumIDE workbench and platform pieces. It is normative for what is **implemented**, **delegated to VS Code**, or **still open**.

Related: [quantumide-chat-platform.md](./quantumide-chat-platform.md), [ChatPanelRe-engineering.md](./ChatPanelRe-engineering.md).

---

## 1. Workspace & project management

| Req | Status | Where / how |
|-----|--------|----------------|
| **1.1** Workspace folder UI (add / remove / rename, errors) | **Partial — QuantumIDE** | Sidebar **QuantumIDE Chat Parity → Workspace folders** tree; toolbar **Add Folder** (`workbench.action.addRootFolder`); context menu **Remove** / **Rename (label)** via `IWorkspaceEditingService`. Invalid paths on add are handled by the native folder picker. |
| **1.2** Interactive manifest editing | **Partial — QuantumIDE** | Commands **Open package.json**, **Open pyproject.toml**, **Add npm script**, **Add npm dependency** (`quantumide.parity.*`). Full JSON/schema UI and pyproject field editors remain incremental work on top of the same services. |

## 2. File navigation & editing

| Req | Status | Where / how |
|-----|--------|----------------|
| **2.1** Fuzzy file finder + preview + highlights | **QuantumIDE + native** | Command **QuantumIDE: Fuzzy Find Workspace Files** (`quantumide.parity.fuzzyWorkspaceFiles`) uses `quantumideFuzzyMatchFilePaths` + quick pick with label highlights; opens via `IQuantumIDEFileNavigationService`. Native **Quick Open** linked from the parity **Navigation & symbols** view. |
| **2.2** Breadcrumbs | **Native** | Built-in editor breadcrumbs (QuantumIDE inherits VS Code editor). |
| **2.3** Go to symbol / definition / references | **Native** | Parity view links to `workbench.action.gotoSymbol`, `editor.action.goToSymbol`, `editor.action.revealDefinition`, `editor.action.goToReferences`. |

## 3. Refactoring & symbol operations

| Req | Status | Where / how |
|-----|--------|----------------|
| **3.1–3.2** Interactive refactor UI, granular ops, import updates | **Native + existing QuantumIDE** | VS Code rename / refactor / multi-file edits; QuantumIDE inline diff / chat edit staging where already integrated. Dedicated “refactor preview dock” beyond native peek/rename is **open** if stricter Cursor-clone UX is required. |

## 4. Testing, linting, verification

| Req | Status | Where / how |
|-----|--------|----------------|
| **4.1** Test explorer | **Native + QuantumIDE summary** | **Testing** view (`workbench.view.testing`) from navigation hub; **Detected tests** tree lists `discoverTestsFromWorkspaceFiles` + `package.json` scripts; file rows open in editor. |
| **4.2** Inline diagnostics / test overlays | **Native** | Problems view link; editor squiggles and test decorations from built-in extensions. |

## 5. Git & source control

| Req | Status | Where / how |
|-----|--------|----------------|
| **5.1** SCM panel | **Native** | `workbench.view.scm` from navigation hub. |
| **5.2** Inline diff / blame | **Native** | Git blame toggle command from hub; SCM inline diff via built-in Git. |
| **5.3** History navigation | **Native** | `timeline.focus` from hub. |

## 6. Dependency management

| Req | Status | Where / how |
|-----|--------|----------------|
| **6.1** Visual dependency graph | **Partial — QuantumIDE** | **Dependency graph (packages)** tree from `IQuantumIDESemanticIndexService.getDependencyGraph()` (expandable package nodes). Rich graph webview is **open**. |
| **6.2** Package manager UI | **Partial — QuantumIDE** | **Add npm dependency** command; full search/registry UI **open** (can extend with marketplace API or terminal `npm install`). |

## 7. Plugins & extensions

| Req | Status | Where / how |
|-----|--------|----------------|
| **7.1** Marketplace UI | **Native + bridge** | Extensions view + VS Marketplace in browser + `QuantumIDE: Manage Plugins`. |
| **7.2** Plugin management | **QuantumIDE** | `quantumide.plugins.manage` and existing plugin settings services. |

## 8. Rich UI & UX

| Req | Status | Where / how |
|-----|--------|----------------|
| **8.1** Drag-and-drop | **Open / native** | Explorer DnD remains native; dedicated DnD controller on a parity tree is **not** shipped in this slice. |
| **8.2** Context menus | **Partial** | Workspace folder remove/rename context menus on the parity tree; other surfaces use native context menus. |
| **8.3** Notification center | **Native** | Command **QuantumIDE: Open Notification Center** → `notifications.showList`. |

## 9. Advanced AI workflows

| Req | Status | Where / how |
|-----|--------|----------------|
| **9.1** Long-running progress, pause/cancel | **Partial** | Cancel/abort continues to flow through the agent host session handler and existing activity steps. **Granular pause/resume of host tool batches** needs a coordinated host↔workbench signal (agent host `ActionType` / RPC extension) and is **open** — protocol actions are auto-generated and were not extended in this change set. |
| **9.2** Step-through agent control | **Open** | Same as 9.1: requires an explicit “step gate” in the OpenAI tool loop and a workbench affordance wired through the agent connection (not only a local command). |

---

## Commands (quick reference)

| Command id | Purpose |
|------------|---------|
| `quantumide.parity.fuzzyWorkspaceFiles` | Fuzzy file picker with highlights |
| `quantumide.parity.showNotificationCenter` | Notification center |
| `quantumide.parity.openPackageJson` / `openPyProject` | Open manifests |
| `quantumide.parity.addPackageScript` / `addPackageDependency` | Edit `package.json` |
| `quantumide.parity.removeWorkspaceFolder` / `renameWorkspaceFolder` | Context actions on workspace folder items |
| `quantumide.parity.addWorkspaceFolder` | View title action on workspace folders view |

View container id: `quantumide.chatPanel.parity` (sidebar).

---

## Tests

- `src/vs/platform/quantumide/test/common/quantumideFuzzyFileMatch.test.ts` — fuzzy matcher behaviour.

Workbench views rely on VS Code UI test harnesses where applicable; add targeted UI tests if a regression-prone DnD or webview graph is introduced later.
