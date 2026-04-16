const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFNumber } = require('pdf-lib');
const yaml = require('js-yaml');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const GS_PATH = process.env.GS_PATH || 'gswin64c';
const PRESETS_PATH = path.join(__dirname, 'presets.yaml');

function normalizeUploadedFilename(name = '') {
    if (!name) return 'upload.pdf';

    const looksMojibake = /Ã.|â|ã|�/.test(name);
    const decoded = looksMojibake ? Buffer.from(name, 'latin1').toString('utf8') : name;

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
        const normalized = normalizeUploadedFilename(file.originalname);
        file.originalname = normalized;
        cb(null, normalized);
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
        let finalMode = mode;
        if (mode === 'auto') {
            try {
                // pdf-lib でカラースペース構造を解析
                // 全ページ明示的グレースケール → BW、それ以外（不明含む）→ COLOR
                const pdfData = await fs.readFile(pdfPath);
                const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
                const csAnalysis = analyzeColorSpaces(pdfDoc);
                finalMode = csAnalysis.allGrayscale ? 'bw' : 'color';
            } catch (pdfLibErr) {
                console.warn('pdf-lib analysis failed, defaulting to color:', pdfLibErr.message);
                finalMode = 'color';
            }
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

        res.json({ files: resultFiles, mode: finalMode, split });


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

// カラースペース分類: 'gray' | 'color' | 'unknown'
function classifyColorSpace(csObj, context, depth = 0) {
    if (depth > 5 || !csObj) return 'unknown';

    const resolved = (csObj instanceof PDFRef) ? context.lookup(csObj) : csObj;
    if (!resolved) return 'unknown';

    if (resolved instanceof PDFName) {
        const name = resolved.decodeText();
        if (name === 'DeviceGray') return 'gray';
        if (name === 'DeviceRGB' || name === 'DeviceCMYK') return 'color';
        return 'unknown';
    }

    if (resolved instanceof PDFArray) {
        const typeObj = resolved.get(0);
        const typeName = (typeObj instanceof PDFName)
            ? typeObj.decodeText()
            : (context.lookupMaybe(typeObj, PDFName) || { decodeText: () => '' }).decodeText();

        switch (typeName) {
            case 'DeviceGray':
            case 'CalGray':
                return 'gray';
            case 'DeviceRGB':
            case 'CalRGB':
            case 'Lab':
            case 'DeviceCMYK':
            case 'Separation':
            case 'DeviceN':
            case 'Pattern':
                return 'color';
            case 'ICCBased': {
                const streamRef = resolved.get(1);
                const stream = context.lookup(streamRef);
                if (stream && (stream instanceof PDFStream || stream instanceof PDFRawStream)) {
                    const nObj = stream.dict.get(PDFName.of('N'));
                    const n = (nObj instanceof PDFNumber)
                        ? nObj.asNumber()
                        : context.lookupMaybe(nObj, PDFNumber)?.asNumber();
                    if (n === 1) return 'gray';
                    if (n === 3 || n === 4) return 'color';
                }
                return 'unknown';
            }
            case 'Indexed':
                return classifyColorSpace(resolved.get(1), context, depth + 1);
            default:
                return 'unknown';
        }
    }

    return 'unknown';
}

// XObject (画像・Form) のカラースペースを検査
// csDict: ページ or Form の ColorSpace 辞書（名前付き CS エイリアス解決用、null 可）
// 戻り値: 'gray' | 'color' | 'unknown' | 'noinfo'
function checkXObjects(xobjDict, context, csDict, depth = 0) {
    if (depth > 3 || !xobjDict) return 'noinfo';

    const resolvedDict = (xobjDict instanceof PDFRef)
        ? context.lookupMaybe(xobjDict, PDFDict)
        : (xobjDict instanceof PDFDict ? xobjDict : null);
    if (!resolvedDict) return 'noinfo';

    let foundGray = false;

    for (const [, value] of resolvedDict.entries()) {
        const xobj = context.lookup(value);
        if (!xobj) continue;

        const dict = (xobj instanceof PDFStream || xobj instanceof PDFRawStream) ? xobj.dict : null;
        if (!dict) continue;

        const subtype = dict.get(PDFName.of('Subtype'));
        const subtypeName = (subtype instanceof PDFName) ? subtype.decodeText() : '';

        if (subtypeName === 'Image') {
            let cs = dict.get(PDFName.of('ColorSpace'));
            // /CS0 等の名前付き CS エイリアスをページ/Form の辞書から解決
            if (cs instanceof PDFName && csDict) {
                const aliased = csDict.get(cs);
                if (aliased) cs = aliased;
            }
            if (cs) {
                const result = classifyColorSpace(cs, context);
                if (result === 'color' || result === 'unknown') return result;
                if (result === 'gray') foundGray = true;
            }
        } else if (subtypeName === 'Form') {
            const innerResources = dict.get(PDFName.of('Resources'));
            if (innerResources) {
                const innerDict = context.lookupMaybe(innerResources, PDFDict);
                if (innerDict) {
                    const innerCSEntry = innerDict.get(PDFName.of('ColorSpace'));
                    const innerCSDict = innerCSEntry ? context.lookupMaybe(innerCSEntry, PDFDict) : null;
                    if (innerCSDict) {
                        for (const [, csVal] of innerCSDict.entries()) {
                            const r = classifyColorSpace(csVal, context);
                            if (r === 'color' || r === 'unknown') return r;
                            if (r === 'gray') foundGray = true;
                        }
                    }
                    const innerXObj = innerDict.get(PDFName.of('XObject'));
                    if (innerXObj) {
                        const r = checkXObjects(innerXObj, context, innerCSDict, depth + 1);
                        if (r === 'color' || r === 'unknown') return r;
                        if (r === 'gray') foundGray = true;
                    }
                }
            }
        }
    }
    return foundGray ? 'gray' : 'noinfo';
}

// pdf-lib によるカラースペース構造解析
// 方針: 不明・証拠なし → COLOR（情報を失わない）、確実にグレーのみ → BW
function analyzeColorSpaces(pdfDoc) {
    const context = pdfDoc.context;
    const pages = pdfDoc.getPages();
    let foundGrayscaleEvidence = false;

    for (const page of pages) {
        const resources = page.node.Resources();
        // Resources なし → CS 情報不明 → COLOR
        if (!resources) return { allGrayscale: false };

        let pageHasCSInfo = false;

        // ColorSpace 辞書を取得・検査
        const csEntry = resources.get(PDFName.of('ColorSpace'));
        const csDict = csEntry ? context.lookupMaybe(csEntry, PDFDict) : null;
        if (csDict) {
            for (const [, value] of csDict.entries()) {
                const result = classifyColorSpace(value, context);
                if (result !== 'gray') return { allGrayscale: false };
                pageHasCSInfo = true;
                foundGrayscaleEvidence = true;
            }
        }

        // XObject を検査（ページの CS 辞書を渡して名前付き CS エイリアスを解決）
        const xobjEntry = resources.get(PDFName.of('XObject'));
        if (xobjEntry) {
            const xResult = checkXObjects(xobjEntry, context, csDict);
            if (xResult === 'color' || xResult === 'unknown') return { allGrayscale: false };
            if (xResult === 'gray') {
                pageHasCSInfo = true;
                foundGrayscaleEvidence = true;
            }
            // 'noinfo' = CS 証拠なし → pageHasCSInfo は立てない
        }

        // このページに CS 証拠なし（テキストのみ等）→ 不明 → COLOR
        if (!pageHasCSInfo) return { allGrayscale: false };
    }

    // 全ページで明示的なグレースケール証拠があった場合のみ BW
    return { allGrayscale: foundGrayscaleEvidence };
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
