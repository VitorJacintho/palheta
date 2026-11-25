# Servidor local simples (sem dependências) para testar o app no computador.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 [-Port 5173]
param([int]$Port = 5173)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Palheta rodando em http://localhost:$Port/  (Ctrl+C para parar)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-cache')
        $bytes = [IO.File]::ReadAllBytes($file)
        if ($ctx.Request.HttpMethod -eq 'HEAD') {
          $res.ContentLength64 = $bytes.Length
        } else {
          $res.ContentLength64 = $bytes.Length
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-Warning $_
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
