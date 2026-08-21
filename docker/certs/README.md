# Corporate/proxy root CA(s) for the Docker build

If `docker compose build` (or `./scripts/run-docker.ps1`) fails during `npm ci`
with a certificate error (`unable to get local issuer certificate`) while
reaching `nodejs.org` or GitHub's release CDN, you're behind an SSL-inspecting
proxy (e.g. Zscaler) whose root CA the build container doesn't trust by
default — even though your Windows host does. `npm`'s own registry is usually
unaffected since it's typically excluded from inspection.

Fix: export that root CA and drop it here as a `.crt` file; both
`docker/backend/Dockerfile` and `docker/frontend/Dockerfile` pick up every
`*.crt` in this directory automatically (via `update-ca-certificates` +
`NODE_EXTRA_CA_CERTS`) — no other change needed.

To export it from Windows (PowerShell), find the relevant entry (commonly
named after the proxy vendor) under the machine's trusted root store and save
it as PEM:

```powershell
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "Zscaler" } | Select-Object -First 1
$path = "docker/certs/zscaler-root-ca.crt"
[System.IO.File]::WriteAllText($path, "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks) + "`n-----END CERTIFICATE-----`n")
```

`*.crt` files in this directory are gitignored by default (see `.gitignore`)
since they're specific to your network — this `README.md` is the only tracked
file here.
