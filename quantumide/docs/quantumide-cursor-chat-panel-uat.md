# UAT Checklist — Cursor Chat Panel Parity (Option B)

Use this checklist for user acceptance testing. Mark each item **Pass / Fail / N/A**.

## 1. Workspace-wide LSP rename

- [ ] Agent proposes rename with preview staged in diff review
- [ ] `apply: true` applies rename across files
- [ ] Checkpoint id returned for undo/restore
- [ ] LSP error (unsupported language) surfaces clearly

## 2. Inline diff accept/reject

- [ ] Inline suggestion appears in editor with diff highlighting
- [ ] Accept current hunk applies edit
- [ ] Reject clears proposal
- [ ] Accept All applies full proposal
- [ ] Reject All marks remaining hunks rejected and clears UI
- [ ] `getSuggestionState` reflects accepted/rejected hunks (via tool or API)

## 3. Editor navigation & UI

- [ ] `open_file` opens correct path at line
- [ ] `highlight_range` shows transient highlight
- [ ] `close_editor` closes tab
- [ ] `set_selection` / `reveal_line_center` work on active file

## 4. Extension management

- [ ] `list` returns installed extensions
- [ ] `install` installs marketplace extension id
- [ ] `enable` / `disable` toggles state
- [ ] Reload message shown when extension requires reload

## 5. Terminal / commands

- [ ] Command shows approval UI when confirmation required
- [ ] Auto-approve path works when settings allow
- [ ] Output appears in chat terminal block
- [ ] Failed command returns actionable error text

## 6. Live collaboration

- [ ] Start session creates `.quantumide/collab/` entry
- [ ] Second client joins same session id
- [ ] Remote participant cursor visible on shared file
- [ ] Chat context message syncs within ~3s (relay or shared folder)
- [ ] Leave session clears presence

## Non-functional

- [ ] No editor freeze >500ms during inline diff render
- [ ] Blocked commands respect `quantumide` command policy
- [ ] Collab UI shows experimental disclaimer when enabled

**Sign-off:** _______________  **Date:** _______________
