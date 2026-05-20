import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function saveFile(
  buffer: Buffer,
  fileName: string,
  _contentType: string,
  isPublic: boolean = false
): Promise<string> {
  const subDir = isPublic ? 'public' : 'private';
  const dir = path.join(UPLOADS_DIR, subDir);
  ensureDir(dir);
  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, buffer);
  return `${subDir}/${safeName}`;
}

export async function getFilePath(cloudStoragePath: string): Promise<string> {
  return path.join(UPLOADS_DIR, cloudStoragePath);
}

export async function deleteStoredFile(cloudStoragePath: string): Promise<void> {
  const filePath = path.join(UPLOADS_DIR, cloudStoragePath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
