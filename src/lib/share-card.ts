// Renders a 1080x1920 "My fridge challenge" story card and shares it.
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

export async function makeShareCard(opts: { fridge?: string | undefined; dish: string; title: string; minutes: number }) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#faf5ec";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#e2622f";
  ctx.font = "800 44px Manrope, sans-serif";
  ctx.fillText("MY FRIDGE CHALLENGE", 90, 170);
  ctx.fillStyle = "#3a2a1f";
  ctx.font = "600 96px Fraunces, Georgia, serif";
  ctx.fillText("Before → After", 90, 290);

  const dish = await loadImg(opts.dish);
  if (opts.fridge) {
    const fridge = await loadImg(opts.fridge);
    cover(ctx, fridge, 90, 360, 440, 620, 48);
    cover(ctx, dish, 550, 360, 440, 620, 48);
  } else cover(ctx, dish, 90, 360, 900, 620, 48);

  ctx.fillStyle = "#3a2a1f";
  ctx.font = "600 78px Fraunces, Georgia, serif";
  const words = opts.title.split(" ");
  let line = "";
  let y = 1130;
  for (const w of words) {
    if (ctx.measureText(line + w).width > 900) {
      ctx.fillText(line, 90, y);
      line = "";
      y += 92;
    }
    line += w + " ";
  }
  ctx.fillText(line, 90, y);

  ctx.fillStyle = "#e2622f";
  ctx.beginPath();
  ctx.roundRect(90, y + 70, 900, 170, 85);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 56px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Made from leftovers in ${opts.minutes} min`, 540, y + 175);

  ctx.fillStyle = "#3a2a1f99";
  ctx.font = "700 40px Manrope, sans-serif";
  ctx.fillText("🍳 fridgie · snap your fridge, dinner's solved", 540, 1820);

  return new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}

export async function shareBlob(blob: Blob, text: string) {
  const file = new File([blob], "fridgie-challenge.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  return "downloaded";
}
