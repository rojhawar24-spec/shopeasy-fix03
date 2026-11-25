(() => {
  'use strict';
  const key = document.getElementById('manual-secret');
  const copyButton = document.getElementById('mfa-copy-key');
  const copyStatus = document.getElementById('mfa-copy-status');
  const qrImage = document.getElementById('mfa-qr-image');
  const downloadButton = document.getElementById('mfa-download-qr');
  const downloadStatus = document.getElementById('mfa-download-status');
  const translate = value => window.ShopEasyI18n?.translate(value) || value;

  if (copyButton && key) {
    copyButton.addEventListener('click', async () => {
      const value = (key.textContent || '').trim();
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          const field = document.createElement('textarea');
          field.value = value;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.appendChild(field);
          field.select();
          const copied = document.execCommand('copy');
          field.remove();
          if (!copied) throw new Error('Clipboard copy was blocked');
        }
        if (copyStatus) copyStatus.textContent = translate('Key copied. Keep it private.');
      } catch {
        if (copyStatus) copyStatus.textContent = translate('Copy failed. Select the key and copy it manually.');
      }
    });
  }

  if (downloadButton && qrImage) {
    downloadButton.addEventListener('click', async () => {
      downloadButton.disabled = true;
      if (downloadStatus) downloadStatus.textContent = translate('Preparing PNG…');
      try {
        if (typeof qrImage.decode === 'function') await qrImage.decode();
        const canvas = document.createElement('canvas');
        const scale = 3;
        canvas.width = 280 * scale;
        canvas.height = 280 * scale;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(qrImage, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG conversion failed')), 'image/png'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'shopeasy-mfa-qr.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (downloadStatus) downloadStatus.textContent = translate('Your QR code download has started.');
      } catch {
        if (downloadStatus) downloadStatus.textContent = translate('The PNG could not be created in this browser. Try another browser or use the manual setup key.');
      } finally {
        downloadButton.disabled = false;
      }
    });
  }
})();
