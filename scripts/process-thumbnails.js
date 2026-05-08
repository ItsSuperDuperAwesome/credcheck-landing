import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const inputDir = path.join(projectRoot, "raw-thumbnails");
const outputDir = path.join(projectRoot, "images", "courses");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const force = process.argv.includes("--force");

function kebabCaseFilename(filename) {
  const parsed = path.parse(filename);
  return parsed.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "thumbnail";
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function shouldSkipOutput(outputPath) {
  return !force && await pathExists(outputPath);
}

async function processImage(file) {
  const ext = path.extname(file).toLowerCase();
  if (!allowedExtensions.has(ext)) return;

  const inputPath = path.join(inputDir, file);
  const baseName = kebabCaseFilename(file);
  const outputPath = path.join(outputDir, `${baseName}.webp`);
  const outputName = path.basename(outputPath);

  if (await shouldSkipOutput(outputPath)) {
    console.log(`Skipped ${file}; images/courses/${outputName} already exists. Use --force to overwrite.`);
    return;
  }

  await sharp(inputPath)
    .resize(1280, 720, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: 82 })
    .toFile(outputPath);

  console.log(`Processed ${file} -> images/courses/${outputName}`);
}

async function main() {
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const entries = await fs.readdir(inputDir);
  const images = entries.filter((entry) => allowedExtensions.has(path.extname(entry).toLowerCase()));

  if (!images.length) {
    console.log("No images found in raw-thumbnails/. Add .jpg, .jpeg, .png, or .webp files and run again.");
    return;
  }

  for (const image of images) {
    try {
      await processImage(image);
    } catch (error) {
      console.error(`Failed to process ${image}:`, error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
