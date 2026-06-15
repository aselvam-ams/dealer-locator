import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../../config.js';

/**
 * Outbound delivery of the Change Register file to a club (spec FR-6 / 9.4).
 * The mock writes to a local folder standing in for the club's secure SFTP
 * folder; a real SFTP client is a drop-in replacement.
 */
export interface SftpDeliverer {
  deliver(club: string, fileName: string, contents: string): Promise<string>;
}

export class LocalFsSftp implements SftpDeliverer {
  constructor(private readonly baseDir: string = config.sftpOutDir) {}

  async deliver(club: string, fileName: string, contents: string): Promise<string> {
    const safeClub = club.replace(/[^a-z0-9_-]/gi, '_');
    const dir = resolve(this.baseDir, safeClub);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, fileName);
    await writeFile(filePath, contents, 'utf8');
    return filePath;
  }
}

export function makeSftpDeliverer(): SftpDeliverer {
  return new LocalFsSftp();
}
