# QuantumIDE Chat Panel — 8-Step Feature Parity

**Status:** Implemented (workbench)  
**Entry:** `quantumideChatPanelEightStep.contribution.ts`

| Step | Requirement | Implementation |
|------|-------------|----------------|
| 1 | Inline suggestions + accept/reject | Editor: `quantumideInlineDiffService`, `InlineDiffAccept/Reject` commands; Chat: `injectInlineSuggestionBar`, `quantumide.chat.inlineSuggestSelection` |
| 2 | Real-time editor manipulation | `IQuantumIDEActiveEditorService` (undo grouped); `quantumide.chat.insertAtCursor`, `replaceSelection` |
| 3 | LSP workspace refactor | `quantumide.chat.lspRefactorMenu`, `ChatLspRenameSymbol` / refactor commands in `quantumideFeatureParity.contribution.ts` |
| 4 | Plugin ecosystem | `registerQuantumIDEPlugin` API; `quantumide.plugins.managePanel`; bootstrap in `QuantumIDEPluginBootstrapContribution` |
| 5 | Rich inline UI in chat | `injectRichCodePreview`, workspaceEdit cards, terminal/test blocks (`quantumideChatInThreadInjectService`) |
| 6 | Real-time context | `ChatSyncRealtime` + cursor/content listeners in `quantumideChatContextOrchestrator`; `quantumide.chat.showEditorContext` |
| 7 | Auto-apply (configurable) | `quantumide.ai.agent.autoApplyEdits` → `quantumideUnifiedEditPipelineService.proposeEdits`; `quantumide.chat.toggleAutoApply` |
| 8 | Multi-file batch UI | `injectBatchReviewSummary`, review overlay, `quantumide.chat.openBatchReview`, single-undo Apply All |

## Settings

- `quantumide.ai.agent.autoApplyEdits` — auto-apply vs review (default: review)
- `quantumide.chat.syncRealtime` — live editor/terminal context sync
- `quantumide.chat.inline.enabled` — inline AI in editor
- `quantumide.plugins.requireConsent` — plugin consent gate

## Verification

```bash
cd quantumide
./scripts/ensure-node22.sh npm run compile-check-ts-native
```
