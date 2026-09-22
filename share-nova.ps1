param([switch]$Stop)

$ErrorActionPreference = 'Stop'
$tailscale = 'C:\Program Files\Tailscale\tailscale.exe'

if (-not (Test-Path -LiteralPath $tailscale)) {
    throw 'Tailscale is not installed. Install it, sign in, and then run this script again.'
}

if ($Stop) {
    & $tailscale funnel --https=443 off
    Write-Host 'NOVA is no longer available on the public internet. Local NOVA is unchanged.'
    exit 0
}

& $tailscale funnel --bg 8000
& $tailscale funnel status
Write-Host 'Backend funnel is active at https://preethu.tailff2d27.ts.net/ for your Vercel frontend.'
