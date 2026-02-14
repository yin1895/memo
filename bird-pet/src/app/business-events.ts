import type { CoreModules } from '@/app/types';
import type { DialogueScene } from '@/features/dialogue-engine';

export function bindBusinessEvents(core: CoreModules): void {
  core.bus.on('pet:clicked', () => {
    core.bubble.say({ text: core.dialogue.getLine('click'), priority: 'normal' });
    if (Math.random() > 0.5) {
      core.effects.playHearts();
    } else {
      core.effects.playSparks();
    }
    void core.storage.incrementInteraction();
  });

  core.bus.on('context:changed', ({ to }) => {
    core.effects.playForContext(to);
  });

  core.bus.on('pomodoro:focus', () => {
    core.effects.playBounce();
  });

  core.bus.on('memory:insight', ({ type }) => {
    const scene = `reflective_${type}` as DialogueScene;
    const snapshot = core.memory.getSnapshot();
    const line = core.dialogue.getLine(scene, { hour: new Date().getHours(), ...snapshot });
    if (line !== '啾啾！') {
      core.bubble.say({ text: line, priority: 'high', duration: 6000 });
    }
  });

  core.bus.on('memory:milestone', ({ message }) => {
    core.bubble.say({ text: `🏆 ${message}`, priority: 'high', duration: 6000 });
    core.effects.playConfetti();
  });
}
