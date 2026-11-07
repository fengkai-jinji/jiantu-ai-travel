$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$yoloRoot = 'F:\归档\数据集与标注\YOLOv8'
$services = @(
    @{ Port=8765; Exe='F:\Miniconda\envs\yolo\python.exe'; Args='-X utf8 web_demo/app.py'; Cwd=$yoloRoot; Log='backend' },
    @{ Port=8766; Exe='F:\Miniconda\envs\yolo\python.exe'; Args='-X utf8 server/maps.py'; Cwd=$projectRoot; Log='maps' },
    @{ Port=5173; Exe='F:\NodeJS\node.exe'; Args='node_modules/vite/bin/vite.js --host 127.0.0.1'; Cwd=$projectRoot; Log='frontend' }
)
foreach ($service in $services) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $service.Exe -ArgumentList $service.Args -WorkingDirectory $service.Cwd -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot ($service.Log+'.log')) -RedirectStandardError (Join-Path $projectRoot ($service.Log+'-error.log'))
    }
}
$ready = $false
for ($attempt=0; $attempt -lt 15; $attempt++) {
    try {
        $null = Invoke-WebRequest 'http://127.0.0.1:5173/trip-api/status' -UseBasicParsing -TimeoutSec 2
        $ready = $true
        break
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw '网页或地图服务未就绪，请检查 frontend-error.log 和 maps-error.log。' }
Start-Process 'http://127.0.0.1:5173/#trip'
Write-Host '见途已打开。首次使用室内模型可能需要等待加载。'
