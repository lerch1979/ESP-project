# HR-ERP Backup Rendszer

## Gyors inditas

```bash
# Azonnali backup (commit + push + jelentes)
npm run backup:now

# Dry-run (csak jelentes, nincs commit/push)
npm run backup:dry

# Backup push nelkul
node scripts/auto_backup.js --no-push

# Backup tesztek nelkul
node scripts/auto_backup.js --no-test
```

## Mit csinal?

1. **Git statusz** - osszegyujti a valtoztatasokat
2. **Tesztek** - lefuttatja az osszes tesztet (opcionalis)
3. **Auto-commit** - commitolja a valtoztatasokat timestamppel
4. **Auto-push** - pusholja a remote-ra
5. **Jelentes** - markdown jelentes mentes a `backups/` mappaba
6. **Google Drive** - opcionalis masolat Google Drive-ra
7. **Cleanup** - regi backup fajlok torlese (max 30 db)

## Konfiguracio

Fajl: `scripts/backup_config.json`

```json
{
  "backup_interval": "daily",       // "hourly" | "daily" | "on-change"
  "backup_path": "../../backups",    // Jelentes mentesi konyvtar
  "auto_commit": true,               // Automatikus git commit
  "auto_push": true,                 // Automatikus git push
  "google_drive_path": null,         // Google Drive mappa (opcionalis)
  "max_backups": 30,                 // Maximalis jelentes fajlok szama
  "test_before_backup": true,        // Tesztek futtatasa backup elott
  "include_test_results": true       // Teszt eredmenyek a jelentesben
}
```

## Cron beallitas

```bash
# Napi backup reggel 7-kor
0 7 * * * cd /path/to/hr-erp-backend && node scripts/auto_backup.js >> logs/backup.log 2>&1

# Orankenti backup (munkaidoeben)
0 8-18 * * 1-5 cd /path/to/hr-erp-backend && node scripts/auto_backup.js >> logs/backup.log 2>&1

# Minden 4 oraban
0 */4 * * * cd /path/to/hr-erp-backend && node scripts/auto_backup.js >> logs/backup.log 2>&1
```

### Cron beallitas macOS-en

```bash
# Crontab szerkesztese
crontab -e

# Sor hozzaadasa (napi 7:00)
0 7 * * * cd "/Users/lerchbalazs/Desktop/HR-ERP-PROJECT/hr-erp backend/hr-erp-backend" && /usr/local/bin/node scripts/auto_backup.js >> logs/backup.log 2>&1
```

## CLI kapcsolok

| Kapcsolo | Leiras |
|----------|--------|
| `--dry-run` | Csak jelentes, nincs commit/push/fajliras |
| `--no-push` | Commit igen, de push nem |
| `--no-test` | Tesztek kihagyasa |

## Jelentes formatum

Minden backup letrehoz egy markdown fajlt: `backups/backup-YYYY-MM-DD-HH-MM.md`

Tartalom:
- Datum, branch, mod
- Git statusz osszesites
- Mai commitok statisztikaja (+/- sorok)
- Teszt eredmenyek (fajlonkent)
- Valtoztatasok listaja
- Utolso 5 commit
- Konfiguracio

## Visszaallitas (restore)

### Git alapu visszaallitas

```bash
# Utolso N commit megtekintese
git log --oneline -20

# Adott commitra visszaallitas (FIGYELEM: elvesznek a kesobbi valtoztatasok!)
git checkout <commit-hash>

# Uj branch letrehozasa egy regi commitbol
git checkout -b restore-branch <commit-hash>

# Adott fajl visszaallitasa
git checkout <commit-hash> -- path/to/file
```

### Backup jelentes keresese

```bash
# Backup fajlok listazasa
ls -la backups/

# Adott napi backup keresese
ls backups/backup-2026-03-08*

# Backup tartalom megtekintese
cat backups/backup-2026-03-08-07-00.md
```

## Google Drive integracio

1. Telepitsd a Google Drive Desktop alkalmazast
2. Allitsd be a `google_drive_path`-ot a config-ban:

```json
{
  "google_drive_path": "/Users/lerchbalazs/Google Drive/HR-ERP-Backups"
}
```

Vagy .env-ben:

```env
GOOGLE_DRIVE_BACKUP_PATH=/Users/lerchbalazs/Google Drive/HR-ERP-Backups
```

A backup script automatikusan masolja a jelentest a megadott mappaba.
