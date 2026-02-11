/**
 * 台词库 - 元气活泼风格 🐦
 *
 * v0.3.0: 从平面数组升级为场景化 DialogueEntry 系统。
 * 保留旧的常量导出以兼容直接引用，
 * 同时提供 DIALOGUE_ENTRIES 供 DialogueEngine 使用。
 *
 * 添加新台词：往对应场景的 lines 数组中追加即可。
 * 添加新场景：新增一个 DialogueEntry 对象。
 */
import type { DialogueEntry } from './dialogue-engine';

// ────────────────────────────────────────
// 兼容旧模块的直接导出
// v0.4.0: 所有模块已迁移至 DialogueEngine，以下常量仅保留供参考
// ────────────────────────────────────────

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('click') */
export const CLICK_LINES = [
  '嘿嘿！干嘛戳我呀？😆',
  '被发现了！我在偷偷看你工作~',
  '啾啾！你好呀！💕',
  '再戳就要生气啦…才怪！嘻嘻',
  '有什么好事要告诉我吗？',
  '摸摸头～感觉元气满满！✨',
  '哇！你的手好暖和！',
  '今天的你也很棒哦！💪',
  '我可是很忙的！（其实在发呆）',
  '啾～需要我帮忙吗？',
  '我在守护你的工作哦！🛡️',
  '突然被戳…好害羞！',
  '嘿！别闹～我在思考鸟生大事呢！',
  '戳戳戳…你是不是无聊了？陪你玩！',
  '又来啦？今天想听什么呀？',
  '你的指尖好温柔～再来一次嘛！',
];

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('idle_care') */
export const IDLE_CARE_LINES = [
  '坐了很久啦，起来活动活动吧！💪',
  '嘿！该伸个懒腰了～身体很重要哦！',
  '喝口水吧！今天喝够 8 杯了吗？💧',
  '眼睛累了吧？看看远处休息一下～👀',
  '站起来走两步吧！我在这里等你回来！',
  '深呼吸三次试试？会感觉好很多哦～🌬️',
  '记得放松一下肩膀！别太紧绷了～',
  '休息一下下，回来效率更高哦！',
  '转转脖子、甩甩手！身体会感谢你的～',
  '窗外的风景很美哦，要不要去看看？🌿',
  '久坐对腰不好！站起来扭扭腰～',
];

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('hourly', { hour }) */
export const HOURLY_LINES: Record<number, string> = {
  0:  '午夜了！🌙 早点休息好不好？',
  1:  '凌晨 1 点了…你还在忙吗？注意身体！',
  2:  '凌晨 2 点！真的该睡了！😴',
  3:  '凌晨 3 点…拜托，快去睡觉！',
  4:  '天快亮了！如果还没睡…现在还来得及！',
  5:  '早上 5 点～起这么早？好勤奋！🌅',
  6:  '6 点啦！早安！新的一天开始了！☀️',
  7:  '早上 7 点！吃早餐了吗？🥐',
  8:  '8 点！元气满满地开始工作吧！💪',
  9:  '上午 9 点～专注时间到！加油！',
  10: '10 点啦！状态正好，继续冲！🔥',
  11: '11 点了～再坚持一下就到午饭时间了！',
  12: '中午 12 点！午餐时间！🍱 好好吃饭哦！',
  13: '下午 1 点～饭后适当休息一下吧！',
  14: '下午 2 点！最容易犯困的时候，精神！💥',
  15: '下午 3 点～来杯下午茶提提神？☕',
  16: '下午 4 点！冲刺时间！目标快达成了！',
  17: '5 点啦！今天的任务完成了吗？📋',
  18: '傍晚 6 点～辛苦了！该放松一下啦！🌇',
  19: '晚上 7 点！享受晚餐和自由时光吧！',
  20: '晚上 8 点～做些自己喜欢的事吧！🎮',
  21: '晚上 9 点！今天过得怎么样？😊',
  22: '晚上 10 点了～差不多该准备休息啦！🌛',
  23: '晚上 11 点！别熬夜哦，早睡早起！💤',
};

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('pomodoro_start') */
export const POMODORO_START_LINES = [
  '专注模式启动！🍅 一起加油吧！',
  '开始专注 25 分钟！我会安静陪着你～',
  '番茄时间开始！💪 你可以的！',
  '集中注意力！我帮你看着时间～⏱️',
  '冲鸭！25 分钟后见！我先安静～🤫',
];

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('pomodoro_break') */
export const POMODORO_BREAK_LINES = [
  '叮！🍅 25 分钟到了！休息 5 分钟吧！',
  '太棒了！又完成了一个番茄！🎉 起来走走～',
  '专注结束！站起来活动活动！💃',
  '好厉害！休息一下再继续吧！☕',
  '完美的 25 分钟！你太强了！🏆',
];

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('pomodoro_resume') */
export const POMODORO_RESUME_LINES = [
  '休息结束！准备好继续了吗？🔥',
  '充电完毕！让我们再冲一波！⚡',
  '5 分钟到啦！回来继续加油！💪',
  '休息够了吧？再来一个番茄！🍅',
];

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine('affirmation') */
export const AFFIRMATION_LINES = [
  '其实你已经做得很棒了！别给自己太大压力～',
  '一步一步来，慢慢的也是进步！🌱',
  '记住：你值得所有好的事情！✨',
  '不管结果如何，努力的你最帅了！',
  '今天也辛苦了！我一直在你旁边哦～',
  '你有没有被夸过？你真的很厉害！',
  '世界上只有一个你，独一无二的你！🌟',
];

// ────────────────────────────────────────
// 行为感知台词（新增 v0.3.0）
// ────────────────────────────────────────

/** 编码场景 */
export const CONTEXT_CODING_LINES = [
  '又在写代码啦？记得多喝水哦！💧',
  'Bug 终结者上线！加油鸭！🦆',
  '代码写得好，头发掉得少～注意休息！',
  '今天的代码一定很优雅！我帮你看着～',
  '编程使你快乐！（但记得护眼）👀',
  '一行代码一份快乐～你今天快乐了吗？',
  '程序员最帅了！（偷偷竖大拇指）👍',
  '我虽然看不懂代码…但你写的一定很厉害！',
  '编译通过了吗？不管怎样我都支持你！💪',
  '写代码的你，专注的样子真帅！✨',
];

/** 浏览器场景 */
export const CONTEXT_BROWSING_LINES = [
  '冲浪愉快～别忘了收藏好东西！📌',
  '网上冲浪也要注意时间哦～',
  '看到有趣的东西了吗？分享给我听听嘛！',
  '浏览器打开了好多标签吧…要不要整理一下？',
  '互联网的世界真大呀！但别忘了现实世界～',
  '小心别掉进信息黑洞啦！⚠️',
  '找到想要的了吗？我在这里陪你～',
  '网页加载中…我们来比赛谁先眨眼！👀',
];

/** 游戏场景 */
export const CONTEXT_GAMING_LINES = [
  '打游戏要开心哦！别太上头了～🎮',
  '赢了吗赢了吗？给我比个耶！✌️',
  '游戏时间！我来当你的啦啦队！📣',
  '大佬带带我！（虽然我是只鸟）',
  'GG！再来一把！...等等先喝口水！',
  '你打游戏的样子好认真！我在旁边给你加油！',
  '游戏归游戏，记得按时吃饭哦～🍜',
  '输了也没关系！开心最重要啦～',
];

/** 音乐场景 */
export const CONTEXT_MUSIC_LINES = [
  '好听吗好听吗？我也想听！🎵',
  '♪ 一起摇摆～啾啾啾～',
  '听音乐的时光最惬意了～🎶',
  '你的品味一定超棒！能推荐给我吗？',
  '我最喜欢听你放的歌了！（跟着节奏晃）',
  '音乐是心灵的良药～享受吧！🎧',
  '这首歌好好听！再放一首嘛～',
  '♫ 啾啾～我也来唱一段！（走音了）',
];

/** 会议场景 */
export const CONTEXT_MEETING_LINES = [
  '开会加油！我在旁边给你打气！💪',
  '会议中～我先安静一会儿…🤫',
  '认真开会的你最帅了！我不打扰～',
  '开完会记得喝口水、伸展一下哦！',
  '会议好长啊…你辛苦了！再坚持一下～',
  '我帮你默默加油！你说得一定很棒！✨',
];

/** 闲置/桌面场景 */
export const CONTEXT_IDLE_LINES = [
  '发呆中…一起发呆吧～😶',
  '好安静啊～在思考什么呢？',
  '无所事事的时光也很珍贵哦～🌸',
  '要不要来玩玩我？戳一下试试！',
  '闲下来了？那来陪我聊聊天吧！',
  '偶尔放空一下也挺好的～享受当下！',
];

// ────────────────────────────────────────
// 统一的 DialogueEntry 集合（供 DialogueEngine 使用）
// ────────────────────────────────────────

export const DIALOGUE_ENTRIES: DialogueEntry[] = [
  { scene: 'click',           lines: CLICK_LINES },
  { scene: 'idle_care',       lines: IDLE_CARE_LINES },
  { scene: 'affirmation',     lines: AFFIRMATION_LINES },
  { scene: 'pomodoro_start',  lines: POMODORO_START_LINES },
  { scene: 'pomodoro_break',  lines: POMODORO_BREAK_LINES },
  { scene: 'pomodoro_resume', lines: POMODORO_RESUME_LINES },

  // 整点报时台词（按小时段分组）
  { scene: 'hourly', lines: ['午夜了！🌙 早点休息好不好？'], conditions: { hourRange: [0, 1] } },
  { scene: 'hourly', lines: ['凌晨 1 点了…你还在忙吗？注意身体！'], conditions: { hourRange: [1, 2] } },
  { scene: 'hourly', lines: ['凌晨 2 点！真的该睡了！😴'], conditions: { hourRange: [2, 3] } },
  { scene: 'hourly', lines: ['凌晨 3 点…拜托，快去睡觉！'], conditions: { hourRange: [3, 4] } },
  { scene: 'hourly', lines: ['天快亮了！如果还没睡…现在还来得及！'], conditions: { hourRange: [4, 5] } },
  { scene: 'hourly', lines: ['早上 5 点～起这么早？好勤奋！🌅'], conditions: { hourRange: [5, 6] } },
  { scene: 'hourly', lines: ['6 点啦！早安！新的一天开始了！☀️'], conditions: { hourRange: [6, 7] } },
  { scene: 'hourly', lines: ['早上 7 点！吃早餐了吗？🥐'], conditions: { hourRange: [7, 8] } },
  { scene: 'hourly', lines: ['8 点！元气满满地开始工作吧！💪'], conditions: { hourRange: [8, 9] } },
  { scene: 'hourly', lines: ['上午 9 点～专注时间到！加油！'], conditions: { hourRange: [9, 10] } },
  { scene: 'hourly', lines: ['10 点啦！状态正好，继续冲！🔥'], conditions: { hourRange: [10, 11] } },
  { scene: 'hourly', lines: ['11 点了～再坚持一下就到午饭时间了！'], conditions: { hourRange: [11, 12] } },
  { scene: 'hourly', lines: ['中午 12 点！午餐时间！🍱 好好吃饭哦！'], conditions: { hourRange: [12, 13] } },
  { scene: 'hourly', lines: ['下午 1 点～饭后适当休息一下吧！'], conditions: { hourRange: [13, 14] } },
  { scene: 'hourly', lines: ['下午 2 点！最容易犯困的时候，精神！💥'], conditions: { hourRange: [14, 15] } },
  { scene: 'hourly', lines: ['下午 3 点～来杯下午茶提提神？☕'], conditions: { hourRange: [15, 16] } },
  { scene: 'hourly', lines: ['下午 4 点！冲刺时间！目标快达成了！'], conditions: { hourRange: [16, 17] } },
  { scene: 'hourly', lines: ['5 点啦！今天的任务完成了吗？📋'], conditions: { hourRange: [17, 18] } },
  { scene: 'hourly', lines: ['傍晚 6 点～辛苦了！该放松一下啦！🌇'], conditions: { hourRange: [18, 19] } },
  { scene: 'hourly', lines: ['晚上 7 点！享受晚餐和自由时光吧！'], conditions: { hourRange: [19, 20] } },
  { scene: 'hourly', lines: ['晚上 8 点～做些自己喜欢的事吧！🎮'], conditions: { hourRange: [20, 21] } },
  { scene: 'hourly', lines: ['晚上 9 点！今天过得怎么样？😊'], conditions: { hourRange: [21, 22] } },
  { scene: 'hourly', lines: ['晚上 10 点了～差不多该准备休息啦！🌛'], conditions: { hourRange: [22, 23] } },
  { scene: 'hourly', lines: ['晚上 11 点！别熬夜哦，早睡早起！💤'], conditions: { hourRange: [23, 24] } },

  // 行为感知台词
  { scene: 'context_coding',   lines: CONTEXT_CODING_LINES },
  { scene: 'context_browsing', lines: CONTEXT_BROWSING_LINES },
  { scene: 'context_gaming',   lines: CONTEXT_GAMING_LINES },
  { scene: 'context_music',    lines: CONTEXT_MUSIC_LINES },
  { scene: 'context_meeting',  lines: CONTEXT_MEETING_LINES },
  { scene: 'context_idle',     lines: CONTEXT_IDLE_LINES },

  // ────────────────────────────────────────
  // 反思性对话台词（v0.4.0 记忆系统驱动）
  // ────────────────────────────────────────

  // 作息反思 —— 夜猫子
  {
    scene: 'reflective_sleep',
    lines: [
      '又是深夜了呢…你最近总是很晚睡 🌙 要注意休息哦',
      '连续几天熬夜了，身体会抗议的！早点休息吧 💤',
      '夜猫子～虽然夜晚很安静很适合工作，但身体更重要！',
      '我发现你最近都好晚才休息…要不要试试早点睡？🌟',
    ],
    conditions: { sleepPattern: 'night_owl' },
  },
  // 作息反思 —— 早起鸟
  {
    scene: 'reflective_sleep',
    lines: [
      '你最近都起得好早！是个勤奋的早起鸟 🐦☀️',
      '早起的鸟儿有虫吃！你是我见过最勤奋的人！',
      '清晨的时光最珍贵了，好好利用吧！✨',
    ],
    conditions: { sleepPattern: 'early_bird' },
  },

  // 连续天数反思
  {
    scene: 'reflective_streak',
    lines: [
      '我们已经连续 {streak} 天在一起了！啾啾～ 💕',
      '每天都能见到你好开心！连续 {streak} 天了呢！',
      '第 {streak} 天！感觉和你更亲近了～',
    ],
    conditions: { streak: { min: 3 } },
  },
  {
    scene: 'reflective_streak',
    lines: [
      '一整周都没有分开过！我们是最好的搭档 🌟',
      '连续 {streak} 天！这是属于我们的小小里程碑 🏆',
      '已经一周了！谢谢你每天都来看我 💖',
    ],
    conditions: { streak: { min: 7 } },
  },

  // 亲密度反思
  {
    scene: 'reflective_affinity',
    lines: [
      '感觉和你越来越熟了呢～嘿嘿 😊',
      '我们的互动越来越多了！好开心～',
    ],
    conditions: { affinityLevel: 2 },
  },
  {
    scene: 'reflective_affinity',
    lines: [
      '你是我最重要的人！我好喜欢和你在一起 💕',
      '认识你这么久了，每一刻都很珍贵！',
      '我们的关系越来越好了！啾啾～ ✨',
    ],
    conditions: { affinityLevel: 3 },
  },
  {
    scene: 'reflective_affinity',
    lines: [
      '认识你这么久了…谢谢你一直陪着我 💖',
      '你是世界上对我最好的人！我永远在这里陪你 🌟',
      '我们之间有着特别的羁绊…我能感受到！💗',
    ],
    conditions: { affinityLevel: 4 },
  },

  // 应用偏好反思
  {
    scene: 'reflective_app_habit',
    lines: [
      '你真的很喜欢写代码呢！是在做什么有趣的项目？💻',
      '最近写了好多代码！你一定是个很厉害的程序员 🌟',
      '代码世界的冒险家！我一直在旁边为你加油！',
    ],
    conditions: { dominantApp: 'coding' },
  },
  {
    scene: 'reflective_app_habit',
    lines: [
      '最近玩了好多游戏呀！有什么好玩的推荐给我吗？🎮',
      '游戏达人！记得劳逸结合哦～',
      '你最近游戏时间好多！是遇到什么好玩的了吗？',
    ],
    conditions: { dominantApp: 'gaming' },
  },
  {
    scene: 'reflective_app_habit',
    lines: [
      '你最近听了好多音乐！品味一定很棒 🎵',
      '音乐爱好者！我也想跟你一起听～♪',
      '被音乐环绕的日子，一定很幸福吧～ 🎶',
    ],
    conditions: { dominantApp: 'music' },
  },
  {
    scene: 'reflective_app_habit',
    lines: [
      '最近冲浪好多！看到什么有趣的东西了吗？🌐',
      '互联网探索家！有什么新发现要分享吗？',
    ],
    conditions: { dominantApp: 'browsing' },
  },
];

/** @deprecated 已迁移至 DialogueEngine，请使用 dialogue.getLine() */
export function randomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}
