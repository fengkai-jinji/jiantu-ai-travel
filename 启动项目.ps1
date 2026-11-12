$ErrorActionPreference = 'Stop'
# 依赖较多，加大 Node 堆上限，避免 vite 长时间运行后 heap out of memory
$env:NODE_OPTIONS = '--max-old-space-size=8192'
$projectRoot = $PSScriptRoot
# 换机器时用环境变量覆盖：JIANTU_PYTHON / JIANTU_NODE 指向自带 ultralytics 的解释器与 node
$python = if ($env:JIANTU_PYTHON) { $env:JIANTU_PYTHON } elseif (Test-Path 'F:\Miniconda\envs\yolo\python.exe') { 'F:\Miniconda\envs\yolo\python.exe' } else { 'python' }
$node = if ($env:JIANTU_NODE) { $env:JIANTU_NODE } elseif (Test-Path 'F:\NodeJS\node.exe') { 'F:\NodeJS\node.exe' } else { 'node' }
$services = @(
    @{ Port=8765; Exe=$python; Args='-X utf8 server/indoor.py'; Cwd=$projectRoot; Log='backend' },
    @{ Port=8767; Exe=$python; Args='-X utf8 server/outdoor.py'; Cwd=$projectRoot; Log='outdoor' },
    @{ Port=8766; Exe=$python; Args='-X utf8 server/maps.py'; Cwd=$projectRoot; Log='maps' },
    @{ Port=5173; Exe=$node; Args='node_modules/vite/bin/vite.js --host 127.0.0.1'; Cwd=$projectRoot; Log='frontend' }
)
foreach ($service in $services) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $service.Exe -ArgumentList $service.Args -WorkingDirectory $service.Cwd -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot ($service.Log+'.log')) -RedirectStandardError (Join-Path $projectRoot ($service.Log+'-error.log'))
    }
}
$ready = $false
$endpoints = @('/trip-api/status', '/outdoor-api/status', '/api/status')
$deadline = [DateTime]::UtcNow.AddSeconds(40)
$pending = $endpoints
while ([DateTime]::UtcNow -lt $deadline) {
    $pending = @()
    foreach ($endpoint in $endpoints) {
        try {
            $null = Invoke-WebRequest ('http://127.0.0.1:5173' + $endpoint) -UseBasicParsing -TimeoutSec 2
        } catch { $pending += $endpoint }
    }
    if ($pending.Count -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw ('以下服务未就绪：' + ($pending -join '、') + '。请检查 frontend、maps、outdoor、backend 对应的 error.log。') }
Start-Process 'http://127.0.0.1:5173/#trip'
Write-Host '见途已打开，地图/Agent、室外与室内识别接口均已响应。AI是否配置以页面连接状态为准。'
