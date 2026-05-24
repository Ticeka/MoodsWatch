# OpenClaw Setup

This folder keeps the MoodsWatch-specific OpenClaw operating docs.

- `OVERNIGHT.md`: overnight coding workflow and trigger template.
- `TOOLS.md`: allowed commands, restricted commands, and write boundaries.
- `TODO.md`: live task board and handoff log for overnight runs.

Root-level OpenClaw bootstrap files (`HEARTBEAT.md`, `IDENTITY.md`, `SOUL.md`, `USER.md`) intentionally stay at the repository root because OpenClaw reads them from the workspace root.

Use this short command from the repository root:

```powershell
.\overnight.cmd "describe the task"
```
