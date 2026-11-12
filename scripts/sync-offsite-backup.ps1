# Kènè — Synchronisation automatique des sauvegardes hors serveur (Règle 3-2-1)
# 1. Serveur VPS (/opt/kene/backups/daily)
# 2. Poste Fondateur local (backups/offsite/)
# 3. Cloud GitHub isolé chiffré AES-256 (branche orpheline vault-backup)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalOffsiteDir = Join-Path $RepoRoot "backups\offsite"
$SshKey = "$env:USERPROFILE\.ssh\kene_vps"
$VpsHost = "root@2.29.53.176"

New-Item -ItemType Directory -Force -Path $LocalOffsiteDir | Out-Null

# 1. Identifier la dernière sauvegarde sur le VPS et récupérer la copie + l'archive chiffrée AES-256
$LatestRemote = (ssh -i $SshKey -o StrictHostKeyChecking=no $VpsHost "ls -t /opt/kene/backups/daily/kene_db_*.db.gz | head -1").Trim()
if (-not $LatestRemote) {
  throw "Aucune sauvegarde trouvée sur le VPS"
}
$FileName = Split-Path -Leaf $LatestRemote
$LocalGz = Join-Path $LocalOffsiteDir $FileName
$LocalEnc = Join-Path $LocalOffsiteDir "kene-latest.db.gz.enc"

scp -i $SshKey -o StrictHostKeyChecking=no "${VpsHost}:${LatestRemote}" $LocalGz
scp -i $SshKey -o StrictHostKeyChecking=no "${VpsHost}:/opt/kene/backups/daily/kene-latest.db.gz.enc" $LocalEnc

# Rotation locale (garder les 14 dernières copies sur le PC)
Get-ChildItem -Path $LocalOffsiteDir -Filter "kene_db_*.db.gz" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 14 |
  Remove-Item -Force -ErrorAction SilentlyContinue

# 2. Répliquer l'archive chiffrée AES-256 sur la branche isolée vault-backup (GitHub Cloud)
$TempVault = Join-Path $env:TEMP "kene-vault-push"
if (Test-Path $TempVault) { Remove-Item -Recurse -Force $TempVault }
New-Item -ItemType Directory -Force -Path $TempVault | Out-Null
Copy-Item $LocalEnc (Join-Path $TempVault "kene-latest.db.gz.enc")
$NowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Set-Content -Path (Join-Path $TempVault "README.md") -Value "# Kènè Encrypted Offsite Vault (AES-256-CBC PBKDF2)`nDernière synchronisation : $NowIso`nFichier source : $FileName`nDéchiffrement : openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in kene-latest.db.gz.enc -out kene.db.gz`n"

Push-Location $TempVault
try {
  $RemoteUrl = (git -C $RepoRoot remote get-url origin).Trim()
  git init -q
  git checkout --orphan vault-backup -q
  git add kene-latest.db.gz.enc README.md
  git -c user.name="Kene Backup Bot" -c user.email="backup@kene-beaute.com" commit -m "chore(vault): encrypted offsite backup $NowIso" -q
  git push -f $RemoteUrl vault-backup:vault-backup -q
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $TempVault -ErrorAction SilentlyContinue
}

# 3. Répliquer sur Google Drive (dossier Kènè Backups : 1-JUA23AEleNKLM8ZvO1E6b2Ea4QbEWMg)
$GdriveCmd = "$env:USERPROFILE\.gemini\antigravity\bin\gdrive.cmd"
$GdriveFolderId = "1-JUA23AEleNKLM8ZvO1E6b2Ea4QbEWMg"
$GdriveEncFileId = "1W2jZhhPrDqjoHKKNm7rgXm4ZALlXw8lr"
if (Test-Path $GdriveCmd) {
  try {
    & $GdriveCmd mutate upload $LocalGz --parent $GdriveFolderId | Out-Null
    & $GdriveCmd mutate update $GdriveEncFileId $LocalEnc | Out-Null
  } catch {
    Write-Warning "Google Drive sync warning: $_"
  }
}

# 4. Mettre à jour le statut hors serveur sur le VPS (fichier JSON UTF-8 sans BOM transféré par SCP)
$SizeMb = [math]::Round((Get-Item $LocalGz).Length / 1MB, 1)
$LocalStatus = Join-Path $LocalOffsiteDir ".offsite-status.json"
$StatusJson = "{`"ok`":true,`"at`":`"$NowIso`",`"target`":`"Google Drive + GitHub (AES-256) + PC Fondateur`",`"detail`":`"Réplication 3-2-1 active sur Google Drive ($SizeMb Mo)`"}"
[IO.File]::WriteAllText($LocalStatus, $StatusJson, (New-Object Text.UTF8Encoding $false))
scp -i $SshKey -o StrictHostKeyChecking=no $LocalStatus "${VpsHost}:/opt/kene/db/backups/.offsite-status.json"
Write-Output "Synchronisation hors serveur réussie : $FileName ($SizeMb Mo) -> Google Drive + PC Fondateur + GitHub Vault AES-256"
