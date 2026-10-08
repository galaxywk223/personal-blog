[CmdletBinding()]
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RuntimeRoot = Join-Path $ProjectRoot '.runtime'
$LogRoot = Join-Path $RuntimeRoot 'logs'
$StatePath = Join-Path $RuntimeRoot 'blog-services.json'
$TimeoutSeconds = 120

function Fail([string]$Message) { throw $Message }
function Read-DotEnv([string]$Path) {
	$result = @{}
	if (Test-Path -LiteralPath $Path) {
		foreach ($line in Get-Content -LiteralPath $Path) {
			if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
				$value = $Matches[2].Trim()
				if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
				$result[$Matches[1]] = $value
			}
		}
	}
	return $result
}
function Get-HttpStatus([string]$Url) {
	try { return [int](Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5).StatusCode } catch { return 0 }
}
function Get-ListeningPid([int]$Port) {
	$conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($conn) { return [int]$conn.OwningProcess }
	return 0
}
function Get-ProcessInfo([int]$ProcessId) {
	return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}
function Test-Record([object]$Record) {
	if (-not $Record -or -not $Record.Pid) { return $false }
	$p = Get-ProcessInfo ([int]$Record.Pid)
	if (-not $p) { return $false }
	if ($Record.StartTimeUtc) {
		try { if ([math]::Abs(([datetime]::Parse($Record.StartTimeUtc) - (Get-Process -Id $Record.Pid).StartTime).TotalSeconds) -gt 5) { return $false } } catch { return $false }
	}
	$cmd = [string]$p.CommandLine
	return (($Record.Kind -eq 'admin' -and $cmd -match 'admin[\\/]server\.mjs') -or ($Record.Kind -eq 'blog' -and $cmd -like "*$ProjectRoot*" -and $cmd -match 'astro'))
}
function Stop-Tree([int]$RootPid) {
	$children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $RootPid" -ErrorAction SilentlyContinue)
	foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
	Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { Fail '未找到 Node.js。请安装 Node.js 20.6 或更高版本后重试。' }
$nodeVersion = (& node --version).Trim().TrimStart('v')
try { $version = [version]$nodeVersion } catch { Fail "无法识别 Node.js 版本：$nodeVersion" }
if ($version -lt [version]'20.6.0') { Fail "Node.js 版本 $nodeVersion 过低；本脚本需要 20.6 或更高版本。" }
if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) { Fail "缺少依赖目录 node_modules。请在项目目录运行 npm install。" }
$astroEntry = Join-Path $ProjectRoot 'node_modules\astro\bin\astro.mjs'
if (-not (Test-Path $astroEntry)) { Fail '未找到 Astro Node.js 入口。请在项目目录运行 npm install。' }
$envPath = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $envPath)) { Fail "缺少 .env 文件。请复制 .env.example 为 .env，并填写管理员配置。" }
$envValues = Read-DotEnv $envPath
if (-not $envValues['ADMIN_SESSION_SECRET']) { Fail '未配置 ADMIN_SESSION_SECRET。请在 .env 中设置随机长字符串。' }
if (-not $envValues['DATABASE_URL']) { Fail '未配置 DATABASE_URL。请在 .env 中设置博客 PostgreSQL 连接字符串。' }
& $node.Source "--env-file=$envPath" (Join-Path $ProjectRoot 'scripts\admin-users.mjs')
if ($LASTEXITCODE -ne 0) { Fail '管理员账号初始化失败。首次启动需配置 ADMIN_INITIAL_USERNAME 和 ADMIN_PASSWORD_HASH。' }
$adminPort = 4322
if ($envValues['ADMIN_PORT']) { if (-not [int]::TryParse($envValues['ADMIN_PORT'], [ref]$adminPort) -or $adminPort -lt 1 -or $adminPort -gt 65535) { Fail "ADMIN_PORT 配置无效：$($envValues['ADMIN_PORT'])" } }

$existing = $null
if (Test-Path $StatePath) { try { $existing = Get-Content $StatePath -Raw | ConvertFrom-Json } catch { $existing = $null } }
$records = @($existing.blog, $existing.admin) | Where-Object { $null -ne $_ }
$healthyRecords = @($records | ForEach-Object { if (Test-Record $_) { $_ } })
$blogListener = Get-ListeningPid 4321
$blogManaged = @($healthyRecords | Where-Object Kind -eq 'blog' | Where-Object Port -eq 4321 | Where-Object Pid -eq $blogListener)
$blogListenerInfo = if ($blogListener) { Get-ProcessInfo $blogListener } else { $null }
if ($blogListener -and $blogManaged.Count -eq 0 -and (-not $blogListenerInfo -or ([string]$blogListenerInfo.CommandLine -notlike "*$ProjectRoot*"))) {
	Fail "端口 4321 已被其他进程占用（PID $blogListener）。请停止占用进程后重试。"
}
$adminListener = Get-ListeningPid $adminPort
$adminManaged = @($healthyRecords | Where-Object Kind -eq 'admin' | Where-Object Port -eq $adminPort | Where-Object Pid -eq $adminListener)
$adminListenerInfo = if ($adminListener) { Get-ProcessInfo $adminListener } else { $null }
if ($adminListener -and $adminManaged.Count -eq 0 -and (-not $adminListenerInfo -or ([string]$adminListenerInfo.CommandLine -notmatch 'admin[\\/]server\.mjs'))) {
	Fail "端口 $adminPort 已被其他进程占用（PID $adminListener）。请停止占用进程后重试。"
}

function Start-Service([string]$Kind, [int]$Port, [string]$FilePath, [string[]]$ArgumentList) {
	$stdout = Join-Path $LogRoot "$Kind.stdout.log"
	$stderr = Join-Path $LogRoot "$Kind.stderr.log"
	$p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
	Start-Sleep -Milliseconds 300
	$process = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
	if (-not $process) {
		Fail "$Kind 服务进程启动后立即退出。请查看日志：$stderr"
	}
	$start = $process.StartTime.ToString('o')
	return [pscustomobject]@{ Kind=$Kind; Pid=$p.Id; Port=$Port; StartTimeUtc=$start; Stdout=$stdout; Stderr=$stderr }
}

$blog = $healthyRecords | Where-Object Kind -eq 'blog' | Where-Object Port -eq 4321 | Select-Object -First 1
$admin = $healthyRecords | Where-Object Kind -eq 'admin' | Where-Object Port -eq $adminPort | Select-Object -First 1
$blogListener = Get-ListeningPid 4321
$adminListener = Get-ListeningPid $adminPort
if (-not $blog -and $blogListener) { $info = Get-ProcessInfo $blogListener; if ($info -and [string]$info.CommandLine -like "*$ProjectRoot*") { $blog = [pscustomobject]@{ Kind='blog'; Pid=$blogListener; Port=4321; StartTimeUtc=(Get-Process -Id $blogListener).StartTime.ToString('o') } } }
if (-not $admin -and $adminListener) { $info = Get-ProcessInfo $adminListener; if ($info -and [string]$info.CommandLine -match 'admin[\\/]server\.mjs') { $admin = [pscustomobject]@{ Kind='admin'; Pid=$adminListener; Port=$adminPort; StartTimeUtc=(Get-Process -Id $adminListener).StartTime.ToString('o') } } }
$started = @()
try {
	if (-not $blog) { $blog = Start-Service 'blog' 4321 $node.Source @($astroEntry,'dev','--host','127.0.0.1','--port','4321'); $started += $blog }
	if (-not $admin) { $admin = Start-Service 'admin' $adminPort $node.Source @("--env-file=$envPath",(Join-Path $ProjectRoot 'admin\server.mjs')); $started += $admin }
	[pscustomobject]@{ blog=$blog; admin=$admin } | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8
	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	do {
		$blogStatus = Get-HttpStatus "http://127.0.0.1:4321/"
		$adminStatus = Get-HttpStatus "http://127.0.0.1:$adminPort/admin/"
		$blogAlive = Test-Record $blog
		$adminAlive = Test-Record $admin
		if (-not $blogAlive -or -not $adminAlive) { Fail "服务进程已退出（博客进程=$blogAlive，管理端进程=$adminAlive）。日志：$LogRoot" }
		if ($blogStatus -ge 200 -and $blogStatus -lt 500 -and $adminStatus -ge 200 -and $adminStatus -lt 500) { break }
		if ((Get-Date) -ge $deadline) { Fail "服务启动超时（博客=$blogStatus，管理端=$adminStatus）。日志：$LogRoot" }
		Start-Sleep -Seconds 1
	} while ($true)
	if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4321/'; Start-Process "http://127.0.0.1:$adminPort/admin/" }
	Write-Host "博客已启动：http://127.0.0.1:4321/"
	Write-Host "管理端已启动：http://127.0.0.1:$adminPort/admin/"
	Write-Host "日志目录：$LogRoot"
} catch {
	foreach ($record in $started) { if (Test-Record $record) { Stop-Tree ([int]$record.Pid) } }
	Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
	throw
}
