# Gera os ícones PNG do app (192, 512 e maskable) usando System.Drawing.
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'

function New-Icon([int]$size, [string]$file, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $bg = [System.Drawing.ColorTranslator]::FromHtml('#14110f')
  $s = $size / 512.0

  if ($maskable) {
    $g.Clear($bg)
    $scale = 0.72  # mantém o desenho dentro da zona segura
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
    $r = 112 * $s
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $path.AddArc($size - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $path.AddArc($size - 2 * $r, $size - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $path.AddArc(0, $size - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $path)
    $scale = 1.0
  }

  $off = $size * (1 - $scale) / 2
  $k = $s * $scale
  function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ([float]($off + $x * $k)), ([float]($off + $y * $k)) }

  # palheta (formato aproximado com curvas de Bézier)
  $pick = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pick.AddBezier((P 256 92), (P 348 92), (P 406 132), (P 406 196))
  $pick.AddBezier((P 406 196), (P 406 282), (P 322 386), (P 256 420))
  $pick.AddBezier((P 256 420), (P 190 386), (P 106 282), (P 106 196))
  $pick.AddBezier((P 106 196), (P 106 132), (P 164 92), (P 256 92))
  $pick.CloseFigure()
  $rect = New-Object System.Drawing.RectangleF ([float]($off + 106 * $k)), ([float]($off + 92 * $k)), ([float](300 * $k)), ([float](328 * $k))
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml('#f5a524')), ([System.Drawing.ColorTranslator]::FromHtml('#ff7a3d')), 45
  $g.FillPath($grad, $pick)

  $pen = New-Object System.Drawing.Pen $bg, ([float](10 * $k))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawLine($pen, (P 196 170), (P 196 330))
  $g.DrawLine($pen, (P 236 160), (P 236 360))
  $g.DrawLine($pen, (P 276 160), (P 276 360))
  $g.DrawLine($pen, (P 316 170), (P 316 330))

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
Write-Output 'Ícones gerados.'
