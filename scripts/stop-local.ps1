[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StatePath = Join-Path $ProjectRoot '.runtime\blog-services.json'
function Get-ProcessInfo([int]$ProcessId) { Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue }
function Stop-Tree([int]$RootPid) {
	& taskkill.exe /PID $RootPid /T /F *> $null
}
function Test-Managed([object]$Record) {
	$p = Get-ProcessInfo ([int]$Record.Pid)
	if (-not $p) { return $false }
	try { if ([math]::Abs(([datetime]::Parse($Record.StartTimeUtc) - (Get-Process -Id $Record.Pid).StartTime).TotalSeconds) -gt 5) { return $false } } catch { return $false }
	$cmd = [string]$p.CommandLine
	return (($Record.Kind -eq 'admin' -and $cmd -match 'admin[\\/]server\.mjs') -or ($Record.Kind -eq 'blog' -and $cmd -like "*$ProjectRoot*" -and $cmd -match 'astro'))
}
if (-not (Test-Path $StatePath)) { Write-Host '没有发现本脚本记录的运行服务。'; exit 0 }
$state = Get-Content $StatePath -Raw | ConvertFrom-Json
foreach ($record in @($state.blog, $state.admin)) { if ($record -and (Test-Managed $record)) { Stop-Tree ([int]$record.Pid); Write-Host "已停止 $($record.Kind) 服务（PID $($record.Pid)）。" } }
Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
Write-Host '博客与管理端已停止。'
