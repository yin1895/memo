import type { EventBus } from '@/events';
import type { AppEvents } from '@/types';
import type { AnimationEngine } from '@/core/animation';
import type { BubbleManager } from '@/core/bubble-manager';
import type { ClickThroughManager } from '@/core/click-through';
import type { EffectsManager } from '@/core/effects';
import type { MenuController } from '@/core/menu';
import type { MemorySystem } from '@/core/memory';
import type { StorageService, PetOwnerProfile } from '@/core/storage';
import type { UpdateController } from '@/core/updater';
import type { ContextAwareness } from '@/features/context-awareness';
import type { DialogueEngine } from '@/features/dialogue-engine';
import type { GreetingManager } from '@/features/greeting';
import type { HourlyChime } from '@/features/hourly-chime';
import type { IdleCareScheduler } from '@/features/idle-care';
import type { MemoryCardManager } from '@/features/memory-card';
import type { MemoryPanelManager } from '@/features/memory-panel';
import type { PomodoroTimer } from '@/features/pomodoro';
import type { QuietModeManager } from '@/features/quiet-mode';
import type { SpecialDateManager } from '@/features/special-dates';
import type { SystemMonitor } from '@/features/system-monitor';

export interface CoreModules {
  bus: EventBus<AppEvents>;
  app: HTMLDivElement;
  canvas: HTMLCanvasElement;
  animation: AnimationEngine;
  clickThrough: ClickThroughManager;
  menu: MenuController;
  bubble: BubbleManager;
  storage: StorageService;
  dialogue: DialogueEngine;
  effects: EffectsManager;
  memory: MemorySystem;
  quietMode: QuietModeManager;
  updater: UpdateController;
  petOwner: PetOwnerProfile;
}

export interface FeatureModules {
  idleCare: IdleCareScheduler;
  hourlyChime: HourlyChime;
  pomodoro: PomodoroTimer;
  systemMonitor: SystemMonitor;
  contextAwareness: ContextAwareness;
  specialDates: SpecialDateManager;
  greeting: GreetingManager;
  memoryCard: MemoryCardManager;
  memoryPanel: MemoryPanelManager;
}

export interface LifecycleController {
  gracefulShutdown: () => Promise<void>;
  setCleanupInteraction: (cleanup: () => void) => void;
  setUnlistenAutostart: (unlisten: Promise<() => void>) => void;
  setUnlistenMemories: (unlisten: Promise<() => void>) => void;
  setUnlistenRequestQuit: (unlisten: Promise<() => void>) => void;
  setAutoSaveTimer: (timer: number) => void;
}
