import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');

function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: path.join(uploadsRoot, subfolder),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  });
}

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image uploads are allowed'));
};

export const uploadWardrobe = multer({ storage: makeStorage('wardrobe'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } });
export const uploadPortfolio = multer({ storage: makeStorage('portfolio'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } });
export const uploadStyleGallery = multer({ storage: makeStorage('style-gallery'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } });
export const uploadBookingAttachments = multer({ storage: makeStorage('bookings'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } });
