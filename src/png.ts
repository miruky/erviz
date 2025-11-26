// SVG文字列をPNGに変換する。ブラウザのImage/Canvasに依存するため、
// ここはアプリ実行時専用で、ユニットテストの対象にしない。

function viewBoxSize(svg: string): { w: number; h: number } {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return { w: Number(m?.[1] ?? 800), h: Number(m?.[2] ?? 600) };
}

/**
 * SVGをPNGのBlobにラスタライズする。
 * @param scale 解像度倍率(2でRetina相当)
 * @param background 透過させたくない場合の下地色
 */
export function svgToPngBlob(svg: string, scale = 2, background?: string): Promise<Blob> {
  const { w, h } = viewBoxSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('2Dコンテキストを取得できません');
        if (background !== undefined) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob === null) reject(new Error('PNGへの変換に失敗しました'));
          else resolve(blob);
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVGの読み込みに失敗しました'));
    };
    img.src = url;
  });
}
