$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..."
npm install

Write-Host "Starting server and web..."
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "dev:server"
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "dev:web"

Write-Host "Aika starting."
Write-Host "Server: http://localhost:8790/health"
Write-Host "Web: http://localhost:3000"
