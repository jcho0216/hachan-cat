import type { GameResult } from './types';

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);

export async function createMemePng(result: GameResult): Promise<{ base64: string; blob: Blob }> {
  const title = escapeXml(`Lv.${result.level} ${result.levelName} · ${result.reward.name} 포획`);
  const verdict = escapeXml(result.verdict);
  const description = escapeXml(result.reward.description);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" rx="72" fill="#FFF8E7"/>
    <circle cx="540" cy="490" r="270" fill="${result.reward.color}"/>
    <text x="80" y="120" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#202124">오늘의 포획 기록</text>
    <text x="1000" y="120" text-anchor="end" font-family="Arial,sans-serif" font-size="30" fill="#6B645C">하찮냥</text>
    <g transform="translate(310 220) scale(3.05)">
      <path d="M31 54 24 14l35 19c10-4 22-4 32 0l35-19-7 41c8 9 12 21 12 34 0 35-25 57-56 57S19 124 19 89c0-14 4-26 12-35Z" fill="${result.reward.color}" stroke="#202124" stroke-width="5" stroke-linejoin="round"/>
      <path d="m32 29 19 12-15 9ZM118 29l-19 12 15 9Z" fill="${result.reward.accent}"/>
      <path d="M42 80q11-9 22 0M88 80q11-9 22 0" fill="none" stroke="#202124" stroke-width="5" stroke-linecap="round"/>
      <path d="m69 96 7 6 7-6" fill="${result.reward.accent}" stroke="#202124" stroke-width="3"/>
      <path d="M64 108q12 14 25 0" fill="none" stroke="#202124" stroke-width="4" stroke-linecap="round"/>
      <g fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"><path d="M75 145q-10 26 0 42"/><path d="M70 157 42 176M79 157l29 16M75 186l-23 22M75 186l25 22"/></g>
    </g>
    <text x="540" y="845" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#F45D4C">${title}</text>
    <text x="540" y="930" text-anchor="middle" font-family="Arial,sans-serif" font-size="82" font-weight="900" fill="#202124">${escapeXml(result.reward.name)}</text>
    <text x="540" y="990" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#6B645C">${description}</text>
    <rect x="110" y="1050" width="860" height="150" rx="36" fill="#FFFFFF"/>
    <text x="320" y="1115" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="900" fill="#202124">${result.grade}</text>
    <text x="320" y="1160" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#6B645C">손가락 등급</text>
    <text x="760" y="1115" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="900" fill="#202124">${(result.elapsedMs / 1000).toFixed(1)}초</text>
    <text x="760" y="1160" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#6B645C">집착한 시간</text>
    <text x="540" y="1280" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="#202124">“${verdict}”</text>
  </svg>`;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('이미지 생성 실패')), 'image/png'));
  const dataUrl = canvas.toDataURL('image/png');
  return { base64: dataUrl.split(',')[1], blob };
}

export async function saveMemeCard(result: GameResult) {
  const { base64, blob } = await createMemePng(result);
  try {
    const { saveBase64Data } = await import('@apps-in-toss/web-framework');
    await saveBase64Data({ data: base64, fileName: `하찮냥-${result.reward.id}.png`, mimeType: 'image/png' });
  } catch {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `하찮냥-${result.reward.id}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

export async function shareChallenge(result: GameResult) {
  const message = `Lv.${result.level} ${result.levelName}을 정확도 ${result.accuracy}%, ${(result.elapsedMs / 1000).toFixed(1)}초 만에 잡았어.\n너는 이것보다 느릴 듯 😼`;
  try {
    const { getTossShareLink, share } = await import('@apps-in-toss/web-framework');
    const link = await getTossShareLink('intoss://hachan-cat');
    await share({ message: `${message}\n${link}` });
  } catch {
    if (navigator.share) {
      await navigator.share({ title: '하찮냥', text: message, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(`${message}\n${window.location.href}`);
    }
  }
}
