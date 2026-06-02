const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../public/uploads/');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const prefix = file.fieldname === 'apk_file' ? 'app-' : 'logo-';
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Increased to 50MB for APKs
  fileFilter: (req, file, cb) => {
    // Strict extension and mimetype checking
    const filetypes = /jpeg|jpg|png|webp|vnd\.android\.package-archive/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase()) || path.extname(file.originalname).toLowerCase() === '.apk';
    const mimetype = filetypes.test(file.mimetype) || file.mimetype === 'application/vnd.android.package-archive';

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (jpeg, jpg, png, webp) atau file APK yang diperbolehkan!'), false);
    }
  }
});

module.exports = upload;
