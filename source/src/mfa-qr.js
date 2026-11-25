import { qrcode as QRCodeGenerator } from 'qrcode-generator';

/**
 * Generate the exact MFA QR representation used by the setup page.
 * Production routes and tests share this helper so tests cannot silently
 * validate a separate, reimplemented QR path.
 */
export function createMfaQr(text) {
  const qr = QRCodeGenerator(0, 'M');
  qr.addData(String(text), 'Byte');
  qr.make();
  const generatedSvg = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  const svgOpening = generatedSvg.match(/^<svg\b[^>]*>/i);
  if (!svgOpening) throw new Error('QR generator did not return a valid SVG root element');

  // Force an opaque white canvas regardless of browser/page theme.
  const whiteBackground = '<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>';
  const svg = generatedSvg.replace(svgOpening[0], `${svgOpening[0]}${whiteBackground}`);
  return {
    svg,
    moduleCount: qr.getModuleCount(),
    errorCorrectionLevel: 'M',
    quietZoneModules: 4,
    isDark: (row, column) => qr.isDark(row, column)
  };
}
