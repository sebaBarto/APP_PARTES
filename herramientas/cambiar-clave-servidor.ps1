# ============================================================
#  Cambio de la clave del servidor de la app SAT
#  Se corre UNA vez, desde la PC de la oficina (la que tiene la
#  carpeta del backend de Cloudflare). Hace solo:
#    1. Genera una clave nueva al azar.
#    2. La carga en Cloudflare (backend sat-backend).
#    3. Te guía para pegarla en Vercel (queda copiada).
#    4. Actualiza el script de planos de la PC.
#    5. Busca otros archivos tuyos que tengan la clave vieja.
#    6. Verifica que la vieja ya no sirva y la nueva sí.
# ============================================================
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ClaveVieja = "54455ad29a4eb28e48ca915e3510ff95ceb682523fa74b32"
$UrlApp     = "https://app-partes-sat15.vercel.app"
$UrlBackend = "https://sat-backend.gsigalovsky.workers.dev"

function Titulo($t) { Write-Host ""; Write-Host "==== $t ====" -ForegroundColor Yellow }
function Ok($t)     { Write-Host "  OK  $t" -ForegroundColor Green }
function Mal($t)    { Write-Host "  !!  $t" -ForegroundColor Red }
function Info($t)   { Write-Host "      $t" }
function Esperar($t) { Write-Host ""; Read-Host "  >>  $t (Enter para seguir)" | Out-Null }

function Probar($url, $clave) {
  try {
    $r = Invoke-WebRequest -Uri $url -Headers @{ Authorization = "Bearer $clave" } -UseBasicParsing -TimeoutSec 30
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

Write-Host ""
Write-Host "  Cambio de la clave del servidor - App SAT" -ForegroundColor Cyan
Write-Host "  Mientras se hace (unos 5 minutos) la app puede dar errores al enviar." -ForegroundColor Cyan
Write-Host "  Lo que manden los tecnicos en ese rato queda guardado y sale solo despues." -ForegroundColor Cyan
Esperar "Si nadie esta cargando un parte en este momento, segui"

# ---------- 0. Antes de tocar nada: la app nueva ya tiene que estar publicada ----------
Titulo "0. Chequeo previo"
$codigo = Probar "$UrlApp/api/datos?coleccion=clientes" ""
if ($codigo -ne 401) { Mal "La app no respondio como se esperaba ($codigo). Revisa la conexion y volve a correr esto."; exit 1 }
$js = (Invoke-WebRequest -Uri "$UrlApp/app.js" -UseBasicParsing).Content
if ($js -match $ClaveVieja) { Mal "La version publicada de la app todavia tiene la clave vieja adentro. Espera a que Vercel termine de publicar y volve a correr esto."; exit 1 }
Ok "La app publicada ya usa pases personales."

# ---------- 1. Clave nueva ----------
Titulo "1. Clave nueva"
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$ClaveNueva = -join ($bytes | ForEach-Object { $_.ToString("x2") })
Ok "Generada (64 caracteres). No la mandes por chat ni mail."

# ---------- 2. Cloudflare ----------
Titulo "2. Cloudflare (backend)"
$carpeta = $null
$candidatas = @("$HOME\Documents", "$HOME\Desktop", "$HOME\OneDrive\Documentos", "$HOME\OneDrive\Escritorio", "$HOME\Documentos", "$HOME\Escritorio", "C:\")
foreach ($base in $candidatas) {
  if (-not (Test-Path $base)) { continue }
  $toml = Get-ChildItem -Path $base -Filter "wrangler.toml" -Recurse -Depth 4 -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules" -and (Get-Content $_.FullName -Raw) -match 'name\s*=\s*"sat-backend"' } |
    Select-Object -First 1
  if ($toml) { $carpeta = $toml.DirectoryName; break }
}
if (-not $carpeta) { $carpeta = Read-Host "  No encontre la carpeta del backend (la que tiene wrangler.toml). Pega la ruta" }
Info "Carpeta del backend: $carpeta"
Push-Location $carpeta
try {
  $ClaveNueva | npx wrangler secret put SERVICIOS_API_TOKEN
  if ($LASTEXITCODE -ne 0) { throw "wrangler devolvio error" }
} catch {
  Pop-Location
  Mal "No se pudo cargar en Cloudflare. Si dice 'not authorized', corre 'npx wrangler login' en esa carpeta y volve a correr este script."
  exit 1
}
Pop-Location
Start-Sleep -Seconds 5
$viejaBackend = Probar "$UrlBackend/api/config" $ClaveVieja
$nuevaBackend = Probar "$UrlBackend/api/config" $ClaveNueva
if ($viejaBackend -eq 401 -and $nuevaBackend -eq 200) { Ok "Cloudflare ya acepta solo la clave nueva." }
else { Mal "Cloudflare respondio vieja=$viejaBackend nueva=$nuevaBackend (se esperaba 401 y 200). Segui igual y revisamos al final." }

# ---------- 3. Vercel ----------
Titulo "3. Vercel (lo unico que se hace a mano)"
Set-Clipboard -Value $ClaveNueva
Ok "La clave nueva quedo COPIADA (Ctrl+V para pegar)."
Info "Se va a abrir Vercel. Ahi:"
Info "  a) Entra al proyecto de la app -> Settings -> Environment Variables."
Info "  b) SERVICIOS_API_TOKEN -> los tres puntitos -> Edit -> borra el valor, Ctrl+V, Save."
Info "  c) BACKEND_NUEVO_TOKEN -> lo mismo: Edit, Ctrl+V, Save."
Info "  d) Arriba -> Deployments -> el primero de la lista -> tres puntitos -> Redeploy -> Redeploy."
Start-Process "https://vercel.com/dashboard"
Esperar "Cuando hayas tocado Redeploy"
Set-Clipboard -Value $ClaveNueva

Info "Esperando a que Vercel termine de publicar (puede tardar 1 a 3 minutos)..."
$listo = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 10
  $v = Probar "$UrlApp/api/historial" $ClaveVieja
  $n = Probar "$UrlApp/api/historial" $ClaveNueva
  Write-Host "      ... vieja=$v nueva=$n"
  if ($v -eq 401 -and $n -eq 200) { $listo = $true; break }
}
if ($listo) { Ok "Vercel ya acepta solo la clave nueva y habla bien con Cloudflare." }
else { Mal "Vercel todavia no responde como se esperaba. Revisa que pegaste la clave en las DOS variables y que hiciste Redeploy. La clave sigue copiada: podes repetir el paso 3 y volver a correr solo la verificacion mas tarde." }

# ---------- 4. Script de planos de la PC ----------
Titulo "4. Script de planos (sync-local-planos)"
$configs = @()
foreach ($base in $candidatas) {
  if (-not (Test-Path $base)) { continue }
  $configs += Get-ChildItem -Path $base -Filter "config.json" -Recurse -Depth 5 -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "sync-local-planos" -and $_.FullName -notmatch "node_modules" }
  if ($configs.Count -gt 0) { break }
}
if ($configs.Count -eq 0) { Info "No encontre el config.json de sync-local-planos en esta PC (si no lo usas aca, no pasa nada)." }
foreach ($c in $configs) {
  $json = Get-Content $c.FullName -Raw | ConvertFrom-Json
  $json.token = $ClaveNueva
  $json | ConvertTo-Json -Depth 10 | Set-Content -Path $c.FullName -Encoding UTF8
  Ok "Actualizado: $($c.FullName)"
}

# ---------- 5. Otros lugares con la clave vieja ----------
Titulo "5. Buscando la clave vieja en otros archivos tuyos"
$encontrados = @()
foreach ($base in @("$HOME\Documents", "$HOME\Desktop", "$HOME\OneDrive", "$HOME\Documentos", "$HOME\Escritorio")) {
  if (-not (Test-Path $base)) { continue }
  $encontrados += Get-ChildItem -Path $base -Recurse -File -Depth 6 -Include *.js,*.ts,*.json,*.jsonc,*.toml,*.env,*.ps1,*.bat,*.txt,*.md,*.html -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules|\\\.git\\|\\\.next\\|\\\.wrangler\\" -and $_.Length -lt 5MB } |
    Select-String -SimpleMatch $ClaveVieja -List -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Path }
}
$encontrados = $encontrados | Where-Object { $_ -notmatch "cambiar-clave-servidor" } | Sort-Object -Unique
if ($encontrados.Count -eq 0) { Ok "No aparece en ningun otro archivo." }
else {
  Mal "Estos archivos todavia tienen la clave vieja. Si alguno es de un sistema que se usa (portal, script), hay que poner la nueva (sigue copiada):"
  $encontrados | ForEach-Object { Info $_ }
}

Titulo "Listo"
if ($listo) {
  Ok "La clave vieja ya no sirve para nada."
  Info "Los tecnicos van a tener que entrar una vez con su contrasena."
  Info "Para guardar la clave nueva en un lugar seguro (gestor de contrasenas), ya la tenes copiada."
} else {
  Mal "Falta terminar el paso 3 (Vercel). Avisale a Claudio lo que salio arriba."
}
Read-Host "  Enter para cerrar" | Out-Null
