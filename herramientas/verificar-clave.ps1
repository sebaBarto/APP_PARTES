# Verificador: NO cambia nada, solo controla cómo quedó el cambio de clave.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ClaveVieja = "54455ad29a4eb28e48ca915e3510ff95ceb682523fa74b32"
$UrlApp     = "https://app-partes-sat15.vercel.app"
$UrlBackend = "https://sat-backend.gsigalovsky.workers.dev"
function Probar($url, $clave) {
  try {
    $h = @{}; if ($clave) { $h.Authorization = "Bearer $clave" }
    $r = Invoke-WebRequest -Uri $url -Headers $h -UseBasicParsing -TimeoutSec 30
    return @([int]$r.StatusCode, $r.Content)
  } catch {
    if ($_.Exception.Response) { return @([int]$_.Exception.Response.StatusCode, "") }
    return @(0, $_.Exception.Message)
  }
}
function Linea($ok, $texto) { if ($ok) { Write-Host "  OK  $texto" -ForegroundColor Green } else { Write-Host "  !!  $texto" -ForegroundColor Red } }

Write-Host ""; Write-Host "  Verificacion del cambio de clave - App SAT" -ForegroundColor Cyan; Write-Host ""
$a = Probar "$UrlApp/api/historial" $ClaveVieja
Linea ($a[0] -eq 401) "1. App (Vercel): la clave vieja ya no entra   [respuesta $($a[0]), se espera 401]"
$b = Probar "$UrlBackend/api/config" $ClaveVieja
Linea ($b[0] -eq 401) "2. Backend (Cloudflare): la clave vieja ya no entra   [respuesta $($b[0]), se espera 401]"
$c = Probar "$UrlApp/api/datos?coleccion=config" ""
$hablan = ($c[0] -eq 200 -and $c[1] -match "app_version_actual")
Linea $hablan "3. App y backend se hablan bien (clave nueva igual en los dos lados)   [respuesta $($c[0])]"
$js = Probar "$UrlApp/app.js" ""
Linea ($js[1] -and $js[1] -notmatch $ClaveVieja) "4. La app publicada no tiene ninguna clave adentro"

$cfg = Get-ChildItem -Path "$HOME" -Filter "config.json" -Recurse -Depth 6 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match "sync-local-planos" -and $_.FullName -notmatch "node_modules" } | Select-Object -First 1
if ($cfg) {
  $t = (Get-Content $cfg.FullName -Raw | ConvertFrom-Json).token
  Linea ($t -and $t -ne $ClaveVieja) "5. Script de planos con la clave nueva   [$($cfg.FullName)]"
} else { Write-Host "      5. Script de planos: no esta en esta PC (si no lo usas aca, no importa)" }

Write-Host ""
if ($a[0] -eq 401 -and $b[0] -eq 401 -and $hablan) {
  Write-Host "  TODO BIEN: la clave vieja ya no sirve y la app funciona." -ForegroundColor Green
} else {
  Write-Host "  Algo quedo a medias. Sacale una foto a esta pantalla y mandasela a Claudio." -ForegroundColor Yellow
}
Write-Host ""
