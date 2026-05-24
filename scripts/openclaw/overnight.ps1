param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Task
)

$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$taskText = ($Task -join " ").Trim()

if (-not $taskText) {
  Write-Host 'Usage: .\overnight.cmd "describe the task"'
  exit 1
}

$message = @"
Start overnight work in $repo.

Use docs/openclaw/OVERNIGHT.md, AGENTS.md, and docs/openclaw/TOOLS.md.
Use docs/openclaw/TODO.md as the live task board and final handoff log.

Task:
$taskText
"@

Push-Location $repo
try {
  openclaw agent --agent moodswatch-overnight --message $message
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
