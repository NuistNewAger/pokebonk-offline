// 由 android/dev/extract-tasks.mjs 从游戏包自动生成，请勿手改。
// 来源: news-CbTCXK8Y-mvlr7rzv.js
// 委托（Encargos）系统：任务表、奖励、抽签算法、周期纪元 —— 与服务端规则保持一致。

export const TASK_TABLE = {
  "daily": [
    [
      {
        "id": "d-kills",
        "metric": "kills",
        "goal": 500
      },
      {
        "id": "d-runs",
        "metric": "runs",
        "goal": 2
      },
      {
        "id": "d-chests",
        "metric": "chests",
        "goal": 6
      },
      {
        "id": "d-rocks",
        "metric": "rocks",
        "goal": 8
      },
      {
        "id": "d-time",
        "metric": "time",
        "goal": 480
      },
      {
        "id": "d-gold",
        "metric": "gold",
        "goal": 1200
      }
    ],
    [
      {
        "id": "d-alphas",
        "metric": "alphas",
        "goal": 2
      },
      {
        "id": "d-react",
        "metric": "reactions",
        "goal": 60
      },
      {
        "id": "d-burn",
        "metric": "burned",
        "goal": 150
      },
      {
        "id": "d-para",
        "metric": "paralyzed",
        "goal": 120
      },
      {
        "id": "d-soak",
        "metric": "soaked",
        "goal": 200
      },
      {
        "id": "d-crits",
        "metric": "crits",
        "goal": 400
      },
      {
        "id": "d-boss",
        "metric": "bosses",
        "goal": 1
      },
      {
        "id": "d-zone2",
        "metric": "stage",
        "goal": 2
      }
    ],
    [
      {
        "id": "d-runkills",
        "metric": "runKills",
        "goal": 1500
      },
      {
        "id": "d-ally",
        "metric": "alphaCaught",
        "goal": 1
      },
      {
        "id": "d-zone3",
        "metric": "stage",
        "goal": 3
      },
      {
        "id": "d-bosses",
        "metric": "bosses",
        "goal": 2
      },
      {
        "id": "d-level",
        "metric": "level",
        "goal": 22
      },
      {
        "id": "d-evo",
        "metric": "evolutions",
        "goal": 2
      }
    ]
  ],
  "weekly": [
    [
      {
        "id": "w-kills",
        "metric": "kills",
        "goal": 8000
      },
      {
        "id": "w-runs",
        "metric": "runs",
        "goal": 12
      },
      {
        "id": "w-play",
        "metric": "playtime",
        "goal": 5400
      },
      {
        "id": "w-chests",
        "metric": "chests",
        "goal": 50
      }
    ],
    [
      {
        "id": "w-alphas",
        "metric": "alphas",
        "goal": 12
      },
      {
        "id": "w-allies",
        "metric": "alphaCaught",
        "goal": 5
      },
      {
        "id": "w-react",
        "metric": "reactions",
        "goal": 600
      },
      {
        "id": "w-bosses",
        "metric": "bosses",
        "goal": 8
      }
    ],
    [
      {
        "id": "w-win",
        "metric": "wins",
        "goal": 1
      },
      {
        "id": "w-legend",
        "metric": "legendaries",
        "goal": 1
      },
      {
        "id": "w-shiny",
        "metric": "shinies",
        "goal": 1
      },
      {
        "id": "w-level",
        "metric": "level",
        "goal": 30
      },
      {
        "id": "w-runkills",
        "metric": "runKills",
        "goal": 3000
      }
    ]
  ]
};

export const TASK_DUST = {"daily":[60,100,160],"weekly":[300,450,700]};

export const TASK_EPOCH = 1791763200000;          // Date.UTC(2026,9,12)
const DAY = 86400000;

// 单局最好成绩型指标（用 max 累加），其余用求和
export const MAX_METRICS = new Set(['stage', 'level', 'runKills', 'time']);

// 游戏内的确定性哈希（murmur3 finalizer）
const y = (e) => {
  let t = (e ^ 2654435769) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 2246822507) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 3266489909) >>> 0;
  return (t ^ (t >>> 16)) >>> 0;
};

// 当前周期序号（= 客户端 En）
export const periodIndex = (period, t = Date.now()) =>
  period === 'daily'
    ? Math.floor((t - TASK_EPOCH) / DAY) + 1
    : Math.floor((t - TASK_EPOCH) / (7 * DAY)) + 1;

// 抽签（= 客户端 He）：period, idx, slot(0-2), reroll 次数
export function drawTask(period, idx, slot, reroll = 0) {
  const list = TASK_TABLE[period][slot];
  const a = y(idx * 977 + slot * 131 + (period === 'weekly' ? 50000 : 0)) % list.length;
  if (!reroll) return list[a];
  return list[(a + 1 + y(idx * 31 + slot * 7 + reroll * 1009) % (list.length - 1)) % list.length];
}

// 任务查表（= 客户端 Ue）
const ALL_TASKS = [...TASK_TABLE.daily.flat(), ...TASK_TABLE.weekly.flat()];
export const taskById = (id) => ALL_TASKS.find((t) => t.id === id) || null;

// 奖励道具（= 客户端 Ke / qe）
export const BAG_POOL = ["rare-candy","lucky-egg","amulet-coin","honey","shiny-stone"];
export const dailyPrizeItem = (idx) => BAG_POOL[y(idx * 61 + 7) % BAG_POOL.length];
export const weeklyPrizeItems = (idx) => [
  'master-ball',
  BAG_POOL[y(idx * 17 + 3) % BAG_POOL.length],
  BAG_POOL[y(idx * 23 + 5) % BAG_POOL.length],
];

// 某个任务在本次结算里的增量
export function metricDelta(metric, result = {}, counters = {}) {
  if (metric === 'runs') return 1;
  if (metric === 'runKills') return Number(result.kills) || 0;
  if (metric === 'playtime') return Number(result.time) || 0;
  if (metric === 'time') return Number(result.time) || 0;
  if (metric in counters) return Number(counters[metric]) || 0;
  if (metric in result) return Number(result[metric]) || 0;
  return 0;
}

// 三档全领后的大奖
export function prizeReward(period, periodState, streak) {
  if (period === 'weekly') {
    return { dust: 500, items: weeklyPrizeItems(periodState.idx), streak: null };
  }
  const s = streak?.last === periodState.idx - 1 ? (streak.n || 0) + 1 : streak?.last === periodState.idx ? (streak.n || 1) : 1;
  return { dust: 50 * Math.min(5, s), items: [dailyPrizeItem(periodState.idx)], streak: { last: periodState.idx, n: s } };
}
