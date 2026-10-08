param(
  [string]$OutputDirectory = './backups'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
docker compose exec -T postgres pg_dump -U waline -d waline | Out-File -Encoding utf8 "$OutputDirectory/waline-$stamp.sql"
Write-Output "Backup written to $OutputDirectory/waline-$stamp.sql"
