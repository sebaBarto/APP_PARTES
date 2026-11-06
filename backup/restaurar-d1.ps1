# Vuelve la base D1 entera (partes, SIMs, instalaciones, historiales...) a como
# estaba en una fecha y hora. Usa Time Travel de Cloudflare: hasta 30 días
# atrás con el plan pago (7 con el gratuito).
#
# Uso (desde la carpeta sat-backend-d1, en PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\restaurar-d1.ps1
#   powershell -ExecutionPolicy Bypass -File .\restaurar-d1.ps1 -Fecha "2026-11-05 18:30"
#
# Antes de tocar nada:
#   1) exporta la base como está ahora a .\backups\ (por las dudas),
#   2) anota el "bookmark" de ahora en .\backups\deshacer-restauracion.txt,
#      que sirve para deshacer la vuelta atrás.
# Para deshacer:  npx wrangler d1 time-travel restore sat-servicios-db --bookmark=<el anotado>
param(
  [string]$Fecha = "",
  [string]$BaseDeDatos = "sat-servicios-db",
  [string]$Carpeta = ".\backups"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null

if (-not $Fecha) { $Fecha = Read-Host "¿A qué fecha y hora querés volver? (ej. 2026-11-05 18:30)" }
try {
  $cuando = [datetime]::ParseExact($Fecha.Trim(), @("yyyy-MM-dd HH:mm", "yyyy-MM-dd H:mm", "dd/MM/yyyy HH:mm", "dd/MM/yyyy H:mm"), [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeLocal)
} catch { Write-Host "No entendí la fecha. Escribila como 2026-11-05 18:30" -ForegroundColor Red; exit 1 }
if ($cuando -gt (Get-Date)) { Write-Host "Esa fecha es en el futuro." -ForegroundColor Red; exit 1 }
$iso = $cuando.ToString("yyyy-MM-ddTHH:mm:sszzz")

Write-Host ""
Write-Host "1) Copia de cómo está la base AHORA..." -ForegroundColor Cyan
$copia = Join-Path $Carpeta ("d1-{0}-antes-de-restaurar-{1}.sql" -f $BaseDeDatos, (Get-Date -Format "yyyy-MM-dd_HHmm"))
npx wrangler d1 export $BaseDeDatos --remote --output=$copia
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $copia) -or (Get-Item $copia).Length -lt 1024) {
  Write-Host "No se pudo hacer la copia de ahora: no se sigue." -ForegroundColor Red; exit 1
}
Write-Host ("   OK: {0}" -f $copia) -ForegroundColor Green

Write-Host "2) Anotando el punto de ahora (para poder deshacer)..." -ForegroundColor Cyan
$infoAhora = (npx wrangler d1 time-travel info $BaseDeDatos 2>&1 | Out-String)
$deshacer = Join-Path $Carpeta "deshacer-restauracion.txt"
Add-Content -Path $deshacer -Value ("=== {0} — antes de volver a {1} ===`r`n{2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $iso, $infoAhora)
Write-Host $infoAhora

Write-Host "3) Punto al que se vuelve:" -ForegroundColor Cyan
npx wrangler d1 time-travel info $BaseDeDatos --timestamp="$iso"
if ($LASTEXITCODE -ne 0) { Write-Host "Cloudflare no tiene ese momento (¿más de 30 días? ¿7 en el plan gratuito?)." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host ("ATENCIÓN: la base vuelve a como estaba el {0}. Todo lo cargado después (partes, SIMs, instalaciones...) deja de verse." -f $cuando.ToString("dd/MM/yyyy HH:mm")) -ForegroundColor Yellow
Write-Host ("Se puede deshacer con el bookmark anotado en {0}." -f $deshacer) -ForegroundColor Yellow
$ok = Read-Host "Escribí VOLVER para confirmar"
if ($ok -ne "VOLVER") { Write-Host "Cancelado: no se tocó nada." ; exit 0 }

npx wrangler d1 time-travel restore $BaseDeDatos --timestamp="$iso"
if ($LASTEXITCODE -ne 0) { Write-Host "La restauración falló: la base quedó como estaba." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Listo. Si algo no quedó bien, para deshacer:" -ForegroundColor Green
Write-Host ("   npx wrangler d1 time-travel restore {0} --bookmark=<el de 'antes' en {1}>" -f $BaseDeDatos, $deshacer) -ForegroundColor Green
