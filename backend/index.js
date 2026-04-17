const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const yaml = require('js-yaml');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const GS_PATH = process.env.GS_PATH || 'gswin64c';
const PRESETS_PATH = path.join(__dirname, 'presets.yaml');

function normalizeUploadedFilename(name = '') {
    if (!name) return 'upload.pdf';

    let decoded = name;
    try {
        const buf = Buffer.from(name, 'latin1');
        const utf8 = buf.toString('utf8');
        if (!/\uFFFD/.test(utf8)) decoded = utf8;
    } catch {}

    return decoded
        .normalize('NFC')
        .replace(/[\\/:*?"<>|]/g, '_');
}

app.use(cors());
app.use(express.json());

const UAL_DIR = path.join(__dirname, 'uploads');
const OUT_DIR = path.join(__dirname, 'outputs');

fs.ensureDirSync(UAL_DIR);
fs.ensureDirSync(OUT_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionDir = path.join(UAL_DIR, Date.now().toString());
        fs.ensureDirSync(sessionDir);
        cb(null, sessionDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'upload.pdf');
    }
});

const upload = multer({ storage });

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', gsPath: GS_PATH });
});

// Presets (server-specific YAML config; absent file = no presets)
app.get('/api/presets', (req, res) => {
    try {
        if (!fs.existsSync(PRESETS_PATH)) {
            return res.json({ presets: [], defaultEditable: ['mode', 'suffix'], defaultPreset: null });
        }
        const raw = fs.readFileSync(PRESETS_PATH, 'utf8');
        const parsed = yaml.load(raw) || {};
        res.json({
            presets: Array.isArray(parsed.presets) ? parsed.presets : [],
            defaultEditable: parsed.defaultEditable || ['mode', 'suffix'],
            defaultPreset: parsed.defaultPreset ?? null
        });
    } catch (err) {
        console.error('presets.yaml parse error:', err.message);
        res.status(500).json({ error: 'Invalid presets.yaml' });
    }
});

// PDF page count & info
app.post('/api/pdf-info', upload.single('pdf'), async (req, res) => {
    try {
        const pdfPath = req.file.path;
        const data = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(data);
        const pages = pdfDoc.getPageCount();
        res.json({ pages, filename: normalizeUploadedFilename(req.file.originalname), path: pdfPath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/convert', async (req, res) => {
    try {
        const { pdfPath, mode, dpi = 400, split = true } = req.body;
        const resolution = parseInt(dpi) || 400;
        const fileName = path.basename(pdfPath, '.pdf');
        const sessionOutDir = path.join(OUT_DIR, path.basename(path.dirname(pdfPath)));
        fs.ensureDirSync(sessionOutDir);

        // 1. Determine mode if auto
        let debugStats = [];
        let finalMode = mode;
        if (mode === 'auto') {
            const inkcovCmd = `"${GS_PATH}" -o - -sDEVICE=inkcov -dNOPAUSE -dBATCH "${pdfPath}"`;
            const gsOutput = await execPromise(inkcovCmd);

            const lines = gsOutput.split(/\r?\n/);
            let hasColor = false;
            for (const line of lines) {
                if (line.includes('CMYK OK')) {
                    const values = line.trim().split(/\s+/);
                    if (values.length >= 3) {
                        const cyan = parseFloat(values[0]);
                        const magenta = parseFloat(values[1]);
                        const yellow = parseFloat(values[2]);
                        debugStats.push({ cyan, magenta, yellow });
                        if (cyan > 0.1 || magenta > 0.1 || yellow > 0.1) {
                            hasColor = true;
                        }
                    }
                }
            }
            finalMode = hasColor ? 'color' : 'bw';
        }

        // 2. Convert to TIFF & PNG previews
        const dev = finalMode === 'color' ? 'tiff24nc' : 'tiffg4';
        const outPattern = split
            ? path.join(sessionOutDir, `${fileName}_page_%d.tif`)
            : path.join(sessionOutDir, `${fileName}.tif`);
        const pngPattern = path.join(sessionOutDir, `${fileName}_page_%d.png`);

        const convertTiffCmd = `"${GS_PATH}" -dNOPAUSE -dBATCH -sDEVICE=${dev} -r${resolution} -sOutputFile="${outPattern}" "${pdfPath}"`;
        const previewDevice = finalMode === 'color' ? 'png16m' : 'pnggray';
        const convertPngCmd = `"${GS_PATH}" -dNOPAUSE -dBATCH -sDEVICE=${previewDevice} -r72 -sOutputFile="${pngPattern}" "${pdfPath}"`;

        await Promise.all([
            execPromise(convertTiffCmd),
            execPromise(convertPngCmd)
        ]);

        // 3. Rename/Sort files
        const rawFiles = await fs.readdir(sessionOutDir);
        if (split) {
            const tifFiles = rawFiles.filter(f => f.endsWith('.tif'));
            const totalPages = tifFiles.length;
            const padLen = Math.max(2, String(totalPages).length);

            for (const f of rawFiles) {
                const pageMatch = f.match(/page_(\d+)\.(tif|png)$/);
                if (pageMatch) {
                    const paddedNum = pageMatch[1].padStart(padLen, '0');
                    const newName = f.replace(`page_${pageMatch[1]}`, `page_${paddedNum}`);
                    if (newName !== f) {
                        await fs.rename(path.join(sessionOutDir, f), path.join(sessionOutDir, newName));
                    }
                }
            }
        }

        // 4. List generated files
        const finalFiles = await fs.readdir(sessionOutDir);
        const resultFiles = finalFiles
            .filter(f => f.endsWith('.tif'))
            .sort()
            .map(f => {
                const pageMatch = f.match(/page_(\d+)\.tif/);
                const pageNum = pageMatch ? pageMatch[1] : '01';
                const previewFile = split
                    ? `${fileName}_page_${pageNum}.png`
                    : `${fileName}_page_1.png`; // First page as preview for merged TIFF
                return {
                    name: f,
                    url: `/api/outputs/${path.basename(sessionOutDir)}/${f}`,
                    relPath: `${path.basename(sessionOutDir)}/${f}`,
                    preview: `/api/outputs/${path.basename(sessionOutDir)}/${previewFile}`
                };
            });

        res.json({ files: resultFiles, mode: finalMode, debugStats, split });


        // 5. Cleanup: delete uploaded PDF (non-blocking)
        const uploadSessionDir = path.dirname(pdfPath);
        fs.remove(uploadSessionDir).catch(err => console.warn('Upload cleanup failed:', err.message));

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/download', (req, res) => {
    const { file, name } = req.query;
    if (!file) return res.status(400).send('File missing');

    const filePath = path.join(OUT_DIR, file);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

    const downloadName = normalizeUploadedFilename(name || path.basename(filePath));
    res.download(filePath, downloadName);
});

// Proxy static assets for better control
app.use('/api/outputs', express.static(OUT_DIR));

// Serve frontend in production
const frontendDir = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    app.get('/{*path}', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendDir, 'index.html'));
        }
    });
}

function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout + stderr);
        });
    });
}

// Periodic cleanup: remove output & upload directories older than 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

async function cleanupOldDirs(dir) {
    try {
        const entries = await fs.readdir(dir);
        const now = Date.now();
        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory() && (now - stat.mtimeMs) > MAX_AGE_MS) {
                await fs.remove(fullPath);
                console.log(`Cleaned up: ${fullPath}`);
            }
        }
    } catch (err) {
        console.warn('Cleanup error:', err.message);
    }
}

setInterval(() => {
    cleanupOldDirs(UAL_DIR);
    cleanupOldDirs(OUT_DIR);
}, CLEANUP_INTERVAL_MS);

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
