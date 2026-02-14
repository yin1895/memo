import { STORE_KEYS } from '@/core/storage';
import { getLocalDateKey } from '@/utils';
import type { CoreModules, FeatureModules } from '@/app/types';

const AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000;

export function getAutoSaveIntervalMs(): number {
  return AUTO_SAVE_INTERVAL_MS;
}

export async function runDailyStartupFlow(
  core: CoreModules,
  features: FeatureModules,
): Promise<void> {
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const lastActiveDate = await core.storage.get<string>(STORE_KEYS.LAST_ACTIVE_DATE, '');
  const today = getLocalDateKey();
  const isFirstLaunchToday = lastActiveDate !== today;

  await core.storage.recordActivity();
  await delay(3000);
  try {
    await features.specialDates.checkToday();
  } catch (e) {
    console.warn('执行特殊日期启动流程失败:', e);
  }
  await delay(2000);
  try {
    features.greeting.checkGreeting(isFirstLaunchToday);
  } catch (e) {
    console.warn('执行问候启动流程失败:', e);
  }
  if (isFirstLaunchToday) {
    await delay(3000);
    try {
      await features.memoryCard.showDailyCard();
    } catch (e) {
      console.warn('展示每日回忆卡片失败:', e);
    }
  }
}
