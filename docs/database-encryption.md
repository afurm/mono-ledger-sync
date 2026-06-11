# Database directory encryption

The local-first model assumes the data directory is on a volume the user
trusts. For most personal-use cases that is the user's home folder. For
users who want a stronger guarantee against disk-image theft, lost laptop,
or shared-machine scenarios, the data directory can be placed on a
volume-level encrypted container. This document walks through the three
major operating systems.

The threat-model section that motivates this guidance is the
"Database leakage" threat in [`docs/threat-model.md`](threat-model.md):
once the SQLite file leaves the machine, the project cannot reach back to
redact it. Volume encryption is the local-OS layer that defends the
file at rest.

The app honors a single environment variable for redirecting the data
directory:

```
MONO_LEDGER_SYNC_DATA_DIR=/path/to/encrypted/mount
```

After the override is set, the app creates the SQLite file under that
directory and reads/writes there. The diagnostics endpoint exposes the
actual file path on the response, so a user can confirm the app is
reading from the encrypted volume:

```
GET /api/app/diagnostics
{
  "database": {
    "filePath": "/Volumes/secure/mono-ledger-sync/demo.sqlite",
    ...
  }
}
```

## macOS — encrypted sparsebundle on FileVault

This approach uses the user's existing FileVault volume and adds a
dedicated encrypted disk image for the data directory. The sparsebundle
mounts on demand and unmounts on logout.

```bash
# 1. Create a 1 GB encrypted sparsebundle (size is auto-growing).
hdiutil create -size 1g -fs APFS -encryption AES-256 -volname "MonoLedger" \
  ~/Documents/mono-ledger-secure.sparsebundle

# 2. Mount it. The OS will prompt for the password.
hdiutil attach ~/Documents/mono-ledger-secure.sparsebundle

# 3. The mount point is /Volumes/MonoLedger. Use it as the data dir.
export MONO_LEDGER_SYNC_DATA_DIR="/Volumes/MonoLedger"
mono-ledger-sync web

# 4. Verify the app picked up the override:
curl -s http://127.0.0.1:<port>/api/app/diagnostics | jq .database.filePath
# Should print a path under /Volumes/MonoLedger.

# 5. Unmount when done. The image re-encrypts on unmount.
hdiutil detach /Volumes/MonoLedger
```

## Linux — LUKS-encrypted loop file

This approach creates a LUKS-encrypted container file on the user's home
volume and mounts it via `cryptsetup`. Requires `cryptsetup` and root for
the open/close steps.

```bash
# 1. Create a 1 GB container file (the size can be larger; the container
#    only uses the space it actually needs).
dd if=/dev/zero of=~/mono-ledger-secure.img bs=1M count=1024

# 2. Set up LUKS on the container. You'll be prompted for a passphrase.
sudo cryptsetup luksFormat ~/mono-ledger-secure.img

# 3. Open the LUKS device and create a filesystem on it.
sudo cryptsetup open ~/mono-ledger-secure.img mono-ledger-secure
sudo mkfs.ext4 /dev/mapper/mono-ledger-secure
sudo cryptsetup close mono-ledger-secure

# 4. To mount, open and mount:
sudo cryptsetup open ~/mono-ledger-secure.img mono-ledger-secure
sudo mkdir -p /mnt/mono-ledger-secure
sudo mount /dev/mapper/mono-ledger-secure /mnt/mono-ledger-secure
sudo chown $USER:$USER /mnt/mono-ledger-secure

export MONO_LEDGER_SYNC_DATA_DIR="/mnt/mono-ledger-secure"
mono-ledger-sync web

# 5. Verify the app picked up the override:
curl -s http://127.0.0.1:<port>/api/app/diagnostics | jq .database.filePath
# Should print a path under /mnt/mono-ledger-secure.

# 6. Unmount and close when done.
sudo umount /mnt/mono-ledger-secure
sudo cryptsetup close mono-ledger-secure
```

## Windows — BitLocker-encrypted VHD

This approach uses the Windows "VHD" virtual-disk feature combined with
BitLocker. Requires Administrator PowerShell for the create/mount steps.

```powershell
# 1. Create a 1 GB VHD.
$vhdPath = "$env:USERPROFILE\Documents\mono-ledger-secure.vhdx"
New-VHD -Path $vhdPath -SizeBytes 1GB -Dynamic

# 2. Mount the VHD so Windows sees it as a disk.
$vhd = Mount-VHD -Path $vhdPath -Passthru | Get-Disk

# 3. Initialize, partition, and format the disk.
Initialize-Disk -InputObject $vhd -PartitionStyle GPT
$partition = New-Partition -DiskNumber $vhd.Number -UseMaximumSize -AssignDriveLetter
Format-Volume -DriveLetter $partition.DriveLetter -FileSystem NTFS -NewFileSystemLabel "MonoLedger" -Confirm:$false

# 4. Enable BitLocker on the mounted volume.
Enable-BitLocker -MountPoint "${$partition.DriveLetter}:\" -EncryptionMethod XtsAes256

# 5. Set the data dir env var (the drive letter will be assigned dynamically;
#    use Get-BitLockerVolume to discover it, or pin the assignment).
$env:MONO_LEDGER_SYNC_DATA_DIR = "${$partition.DriveLetter}:\mono-ledger-sync"
mono-ledger-sync web

# 6. Verify the app picked up the override:
curl http://127.0.0.1:<port>/api/app/diagnostics | jq .database.filePath
# Should print a path under the BitLocker-mounted drive.
```

## General guidance

- Treat the encryption password as you would a Monobank token. If the
  password is lost, the SQLite file is unrecoverable — make a separate
  encrypted backup of the container file before relying on it as the
  only copy.
- The diagnostics endpoint's `database.filePath` is the authoritative
  answer to "is the app reading from the encrypted volume?". If you do
  not see the path you expect, the env var is not set in the process
  you are running.
- The local API server's local-only bind (`127.0.0.1` by default) is
  unchanged. Volume encryption is a defense for the data at rest, not
  for the data in motion inside a running process.
