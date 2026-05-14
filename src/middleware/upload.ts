import multer from "multer";

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const maxFileBytes = Number(process.env.MINIO_MAX_FILE_BYTES ?? DEFAULT_MAX_FILE_BYTES);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileBytes } });

function single(fieldName: string) {
  return upload.single(fieldName);
}

function multiple(fieldName: string, maxCount?: number) {
  return upload.array(fieldName, maxCount ?? 6);
}

function multerErrorHandler(err: any, _req: any, res: any, next: any) {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `Archivo demasiado grande. Máximo ${Math.floor(maxFileBytes / (1024 * 1024))}MB.` });
    }
    return res.status(400).json({ error: err.message || "Error en subida de archivo" });
  }
  next();
}

export { upload, single, multiple, multerErrorHandler, maxFileBytes };
