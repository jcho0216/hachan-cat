import { getLevel } from './levels';
import type { GameLoss, GameResult } from './types';
import { getLossCopy } from './lossCopy';
import { createCardCatSvg } from './catAppearance';
import { createCatchChallengeDeepLink, createCatchChallengeWebUrl, createLossChallengeDeepLink, createLossChallengeWebUrl } from './challenge';
import { getCatchMoment } from './resultMoment';
import { isNativeShareVersionSupported, isShareCancellation, ShareCancelledError } from './shareOutcome';

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);
const SHARE_PREVIEW_IMAGE_URL = 'https://hachan-cat.vercel.app/og-thumbnail.png?v=2';
export type SaveOutcome = 'native' | 'download';
export type ShareOutcome = 'native' | 'web' | 'clipboard';

async function blobToBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('이미지 인코딩 실패'));
    reader.readAsDataURL(blob);
  });
}

async function svgToPng(svg: string): Promise<{ base64: string; blob: Blob }> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('카드 SVG를 불러오지 못했어요.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이미지 캔버스를 사용할 수 없어요.');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('이미지 생성 실패')), 'image/png'));
    return { base64: await blobToBase64(blob), blob };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createMemeSvg(result: GameResult) {
  const level = getLevel(result.level);
  const moment = getCatchMoment(result, level.hitsRequired ?? 1);
  const title = escapeXml(`Lv.${result.level} ${result.levelName} · ${result.reward.name} 획득`);
  const verdict = escapeXml(result.verdict);
  const description = escapeXml(result.reward.description);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" rx="72" fill="#FFF8E7"/>
    <circle cx="540" cy="490" r="270" fill="${level.accent}"/>
    <text x="80" y="120" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#202124">오늘의 ${escapeXml(moment.label)}</text>
    <text x="1000" y="120" text-anchor="end" font-family="Arial,sans-serif" font-size="30" fill="#6B645C">하찮냥</text>
    ${createCardCatSvg(level, result.reward.face)}
    <text x="540" y="845" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#F45D4C">${title}</text>
    <text x="540" y="930" text-anchor="middle" font-family="Arial,sans-serif" font-size="82" font-weight="900" fill="#202124">${escapeXml(result.reward.name)}</text>
    <text x="540" y="990" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#6B645C">${description}</text>
    <rect x="110" y="1050" width="860" height="150" rx="36" fill="#FFFFFF"/>
    <text x="320" y="1115" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="900" fill="#202124">${result.grade}</text>
    <text x="320" y="1160" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#6B645C">플레이 등급</text>
    <text x="760" y="1115" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="900" fill="#202124">${(result.elapsedMs / 1000).toFixed(1)}초</text>
    <text x="760" y="1160" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#6B645C">걸린 시간</text>
    <text x="540" y="1280" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="#202124">“${verdict}”</text>
  </svg>`;

  return svg;
}

export async function createMemePng(result: GameResult): Promise<{ base64: string; blob: Blob }> {
  return svgToPng(createMemeSvg(result));
}

export async function createLossMemePng(loss: GameLoss): Promise<{ base64: string; blob: Blob }> {
  const level = getLevel(loss.level);
  const copy = getLossCopy(loss);
  const headline = escapeXml(copy.title);
  const description = escapeXml(copy.description);
  const quote = escapeXml(copy.quote);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" rx="72" fill="#FFF8E7"/>
    <rect x="380" y="70" width="320" height="84" rx="18" fill="none" stroke="#FF6757" stroke-width="9" transform="rotate(-3 540 112)"/>
    <text x="540" y="126" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="900" letter-spacing="5" fill="#FF6757">CAT WINS</text>
    <circle cx="540" cy="500" r="270" fill="${level.accent}" opacity=".8"/>
    ${createCardCatSvg(level)}
    <text x="540" y="850" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#F45D4C">Lv.${loss.level} ${escapeXml(loss.levelName)} 놓침</text>
    <text x="540" y="945" text-anchor="middle" font-family="Arial,sans-serif" font-size="76" font-weight="900" fill="#202124">${headline}</text>
    <text x="540" y="1010" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#6B645C">${description}</text>
    <rect x="110" y="1065" width="860" height="140" rx="36" fill="#FFFFFF"/>
    <text x="320" y="1130" text-anchor="middle" font-family="Arial,sans-serif" font-size="50" font-weight="900" fill="#202124">${loss.attempts}회</text>
    <text x="320" y="1170" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#6B645C">시도</text>
    <text x="760" y="1130" text-anchor="middle" font-family="Arial,sans-serif" font-size="50" font-weight="900" fill="#202124">${(loss.elapsedMs / 1000).toFixed(1)}초</text>
    <text x="760" y="1170" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#6B645C">플레이 시간</text>
    <text x="540" y="1280" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="#202124">“${quote}”</text>
  </svg>`;
  return svgToPng(svg);
}

async function savePng(base64: string, blob: Blob, fileName: string): Promise<SaveOutcome> {
  try {
    const { saveBase64Data } = await import('@apps-in-toss/web-framework');
    await saveBase64Data({ data: base64, fileName, mimeType: 'image/png' });
    return 'native';
  } catch {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return 'download';
  }
}

export async function saveMemeCard(result: GameResult): Promise<SaveOutcome> {
  const { base64, blob } = await createMemePng(result);
  return savePng(base64, blob, `하찮냥-${result.reward.id}.png`);
}

export async function saveLossMemeCard(loss: GameLoss): Promise<SaveOutcome> {
  const { base64, blob } = await createLossMemePng(loss);
  return savePng(base64, blob, `하찮냥-패배-Lv${loss.level}.png`);
}

async function shareWithFallback(title: string, message: string, webUrl: string, deepLink: string): Promise<ShareOutcome> {
  try {
    const { getTossShareLink, isMinVersionSupported, share } = await import('@apps-in-toss/web-framework');
    if (!isNativeShareVersionSupported(isMinVersionSupported)) throw new Error('네이티브 공유 미지원');
    const link = await getTossShareLink(deepLink, SHARE_PREVIEW_IMAGE_URL);
    try {
      await share({ message: `${message}\n${link}` });
      return 'native';
    } catch (error) {
      if (isShareCancellation(error)) throw new ShareCancelledError();
    }
  } catch (error) {
    if (isShareCancellation(error)) throw new ShareCancelledError();
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text: message, url: webUrl });
      return 'web';
    } catch (error) {
      if (isShareCancellation(error)) throw new ShareCancelledError();
    }
  }
  await navigator.clipboard.writeText(`${message}\n${webUrl}`);
  return 'clipboard';
}

export async function shareChallenge(result: GameResult): Promise<ShareOutcome> {
  const moment = getCatchMoment(result, getLevel(result.level).hitsRequired ?? 1);
  const message = `[${moment.label}] Lv.${result.level} ${result.levelName}, ${(result.elapsedMs / 1000).toFixed(1)}초 만에 잡음.\n이 기록 넘을 수 있겠어? 😼`;
  const webUrl = createCatchChallengeWebUrl(result);
  return shareWithFallback('하찮냥', message, webUrl, createCatchChallengeDeepLink(result));
}

export async function shareLossChallenge(loss: GameLoss): Promise<ShareOutcome> {
  const detail = loss.reason === 'time' ? '15초 동안 못 잡았어' : '기회 5번을 다 놓쳤어';
  const message = `Lv.${loss.level} ${loss.levelName}, 나는 ${detail}.\n너는 잡을 수 있겠어? 😿`;
  const webUrl = createLossChallengeWebUrl(loss);
  return shareWithFallback('하찮냥 놓친 기록', message, webUrl, createLossChallengeDeepLink(loss));
}
