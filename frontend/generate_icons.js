import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public', 'favicon.svg');
const out192 = path.resolve('public', 'icon-192.png');
const out512 = path.resolve('public', 'icon-512.png');
const outApple = path.resolve('public', 'apple-touch-icon.png');
const outIco = path.resolve('public', 'favicon.ico');

async function generateIcons() {
    try {
        console.log("Generating 192x192 PNG...");
        await sharp(svgPath).resize(192, 192).png().toFile(out192);

        console.log("Generating 512x512 PNG...");
        await sharp(svgPath).resize(512, 512).png().toFile(out512);

        console.log("Generating 180x180 Apple Touch Icon...");
        await sharp(svgPath).resize(180, 180).png().toFile(outApple);

        console.log("Generating 32x32 ICO fallback...");
        await sharp(svgPath).resize(32, 32).png().toFile(outIco);

        console.log("Icons generated successfully!");
    } catch (err) {
        console.error("Error generating icons:", err);
    }
}

generateIcons();
