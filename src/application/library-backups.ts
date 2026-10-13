import {
  BACKUP_SCHEMA_VERSION,
  checkBackupSize,
  parseBackupDocument,
  parseBackupText,
  serializeBackup,
  type LibraryBackup,
} from '../domain/backup'
import type { LocalIdentity } from '../domain/identity'
import type { BackupLocalRepository } from '../domain/repositories/local-repository'

export class LibraryBackups {
  private readonly repository: BackupLocalRepository
  private readonly now: () => Date
  constructor(
    repository: BackupLocalRepository,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository
    this.now = now
  }

  async export() {
    const data = await this.repository.readSnapshot()
    const document = parseBackupDocument({
      format: 'auditorium-backup',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      data,
    })
    return { document, text: serializeBackup(document) }
  }

  async readFile(file: Pick<Blob, 'size' | 'text'>): Promise<LibraryBackup> {
    checkBackupSize(file.size)
    const backup = parseBackupText(await file.text())
    serializeBackup(backup)
    return backup
  }

  async restore(input: unknown, expectedIdentity: LocalIdentity) {
    const backup = parseBackupDocument(input)
    serializeBackup(backup)
    return this.repository.restoreEmpty(backup.data, expectedIdentity)
  }
}
