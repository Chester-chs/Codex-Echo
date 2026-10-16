export function createDemo(now = Date.now()) {
  const iso = (hours) => new Date(now + hours * 3600000).toISOString();
  return {
    generatedAt: iso(0),
    lastPolledAt: iso(-0.05),
    resets: [
      {
        postId: "900001",
        url: "https://x.com/i/status/900001",
        postedAt: iso(-18),
        detectedAt: iso(-17.95),
        resetType: "automatic",
        author: "Demo source",
        original:
          "Synthetic example: a new global reset announcement has been recorded. Check your account for availability.",
        translation:
          "合成示例：收录了一条新的全局重置公告。实际可用额度请查看你的账号。",
      },
      {
        postId: "900002",
        url: "https://x.com/i/status/900002",
        postedAt: iso(-70),
        detectedAt: iso(-69.95),
        resetType: "banked",
        author: "Demo source",
        original:
          "Synthetic example: a banked reset is available for eligible accounts.",
        translation: "合成示例：符合条件的账号可使用一次重置券。",
      },
      ...[94, 158, 251, 310, 410, 455].map((hours, index) => ({
        postId: `90000${index + 3}`,
        url: `https://x.com/i/status/90000${index + 3}`,
        postedAt: iso(-hours),
        detectedAt: iso(-hours + 0.05),
        resetType: "automatic",
        author: "Demo source",
        original: "Synthetic example of a historical reset announcement.",
        translation: "合成的历史重置公告示例。",
      })),
    ],
    forecast: {
      probability: 68,
      publishedAt: iso(-2),
      validUntil: iso(18),
      windowStart: iso(4),
      windowEnd: iso(18),
      sourceUrl: "https://x.com/i/status/900099",
      basis:
        "Synthetic example only: an illustrative forecast combining a public signal and historical intervals. This is not a real prediction.",
      basisZh:
        "仅为合成示例：展示结合公开信号与历史间隔的预测说明。这不是实际预测。",
    },
  };
}
