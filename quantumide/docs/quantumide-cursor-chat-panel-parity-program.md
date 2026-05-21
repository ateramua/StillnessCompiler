# Cursor Chat Panel Parity — Option B Phased Program

**Objective:** Full parity with the Cursor Chat Panel development requirement (six feature areas + completion criteria), delivered in phases.

**Status:** Phases 0–3 complete; Phase 4 docs published (UAT sign-off manual). Phase 2 collab is OT-lite, not full CRDT.

---

## Phase map

| Phase | Scope | Exit criteria |
|-------|--------|---------------|
| **0** | Program scaffolding, traceability, agent prompts | Plan published; requirements mapped |
| **1** | §1–§5 hardening (rename, inline diff, editor, extensions, terminal) | Acceptance criteria met in product; compile clean |
| **2** | §6 collaboration (relay, presence cursors, chat context sync, line patches) | Sessions start/join/leave; remote cursors visible; chat context synced |
| **3** | Automated tests + verification script | New unit tests green; `quantumide-cursor-parity-program-verify.sh` passes |
| **4** | Migration guide, UAT checklist, user/dev docs | Published under `docs/` |

---

## Requirement traceability

| # | Requirement | Phase | Implementation |
|---|-------------|-------|----------------|
| 1 | Workspace-wide LSP rename | 1 | `IQuantumIDEWorkspaceRenameService`, `quantumide_lsp_workspace_rename` (`previewOnly` / `apply`) |
| 2 | Inline diff accept/reject | 1 | `IQuantumIDEInlineDiffService` + hunk state + Accept All / Reject All |
| 3 | Editor navigation & UI | 1 | `quantumide_manipulate_editor` (+ highlight, close tab) |
| 4 | Plugin/extension management | 1 | `quantumide_manage_extension` (`install`, enable, disable, list) |
| 5 | Terminal/command execution | 1 | `quantumide_run_terminal_command` + chat confirmation |
| 6 | Live collaboration | 2 | Collab session + relay + `quantumideCollabCursorDecorationsService` + chat context sync |

---

## Completion criteria (honest status)

| Criterion | Status | Notes |
|-----------|--------|-------|
| All features implemented | **Phase 1–2 done** | Collab is OT-lite, not CRDT (see QPR-9.2.003) |
| >95% coverage on new paths | **Phase 3 done (platform)** | 6 test modules + Phase 3 bundle; workbench services covered via UAT |
| UAT parity with Cursor | **Phase 4** | Manual checklist in `quantumide-cursor-chat-panel-uat.md` |
| Documentation published | **Phase 4** | Migration + this program doc |

---

## Verification

```bash
cd quantumide
./scripts/quantumide-cursor-parity-program-verify.sh
```

---

## Related documents

- [quantumide-cursor-chat-panel-migration.md](./quantumide-cursor-chat-panel-migration.md)
- [quantumide-cursor-chat-panel-uat.md](./quantumide-cursor-chat-panel-uat.md)
- [quantumide-chat-eight-features-parity.md](./quantumide-chat-eight-features-parity.md)
- [quantumide-production-requirements-traceability.md](./quantumide-production-requirements-traceability.md)
