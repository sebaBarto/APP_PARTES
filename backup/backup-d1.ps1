# Backup de la base D1 (sat-backend-d1) a un archivo .sql con fecha.
# Uso (desde la carpeta sat-backend-d1, en PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\backup-d1.ps1
# Guarda en .\backups\ y conserva solo los últimos 30.
param(
  [string]$BaseDeDatos = "sat-backend-d1",   # nombre en wrangler.toml (database_name)
  [string]$Carpeta = ".\backups",
  [int]$Conservar = 30
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
$archivo = Join-Path $Carpeta ("d1-{0}-{1}.sql" -f $BaseDeDatos, (Get-Date -Format "yyyy-MM-dd_HHmm"))

Write-Host "Exportando $BaseDeDatos -> $archivo ..."
npx wrangler d1 export $BaseDeDatos --remote --output=$archivo
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $archivo) -or (Get-Item $archivo).Length -lt 1024) {
  Write-Host "ERROR: el backup falló o quedó vacío." -ForegroundColor Red
  exit 1
}
Write-Host ("OK ({0:N0} KB)" -f ((Get-Item $archivo).Length / 1KB)) -ForegroundColor Green

# Borra los más viejos
Get-ChildItem $Carpeta -Filter "d1-$BaseDeDatos-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conservar | Remove-Item -Force
