import raw from "@/data/kaishi.json";
import illBridge from "@/assets/ill-hashi-bridge.png";
import illChopsticks from "@/assets/ill-hashi-chopsticks.png";
import illEdge from "@/assets/ill-hashi-edge.png";

export type Word = {
  id: number;
  word: string;
  reading: string;
  meaning: string;
  sentence: string;
  sentenceEn: string;
  sentenceFurigana: string;
  notes: string;
  pitch: string;
  freq: number | null;
  imageAlt: string;
  homophones: number[];
  sharedKanji: number[];
  similarMeaning: number[];
  image?: string;
};

// Curated confusable words that supplement the Kaishi 1.5k export.
const extras: Word[] = [
  {
    id: 1501, word: "橋", reading: "はし", meaning: "bridge",
    sentence: "橋を渡って学校へ行きます。", sentenceEn: "I cross the bridge to go to school.",
    sentenceFurigana: " 橋[はし]を 渡[わた]って 学校[がっこう]へ 行[い]きます。",
    notes: "Pitch accent: はし↗ (low-high). Compare 箸 (high-low) and 端 (flat).",
    pitch: "ハシ", freq: 1800, imageAlt: "赤い橋のイラスト", homophones: [1502, 1503], sharedKanji: [], similarMeaning: [], image: illBridge,
  },
  {
    id: 1502, word: "箸", reading: "はし", meaning: "chopsticks",
    sentence: "箸でご飯を食べます。", sentenceEn: "I eat rice with chopsticks.",
    sentenceFurigana: " 箸[はし]でご 飯[はん]を 食[た]べます。",
    notes: "Pitch accent: は↘し (high-low). The kanji has the bamboo radical ⺮ on top — chopsticks are made of bamboo.",
    pitch: "ハ＼シ", freq: 2400, imageAlt: "お箸のイラスト", homophones: [1501, 1503], sharedKanji: [], similarMeaning: [], image: illChopsticks,
  },
  {
    id: 1503, word: "端", reading: "はし", meaning: "edge, end, tip",
    sentence: "机の端に本を置いた。", sentenceEn: "I put the book on the edge of the desk.",
    sentenceFurigana: " 机[つくえ]の 端[はし]に 本[ほん]を 置[お]いた。",
    notes: "Flat pitch accent. Also read はた (side) and はな (tip) in other words.",
    pitch: "ハシ￣", freq: 2100, imageAlt: "端に立つ人のイラスト", homophones: [1501, 1502], sharedKanji: [], similarMeaning: [], image: illEdge,
  },
  {
    id: 1504, word: "暑い", reading: "あつい", meaning: "hot (weather)",
    sentence: "今日はとても暑いですね。", sentenceEn: "It's very hot today, isn't it?",
    sentenceFurigana: " 今日[きょう]はとても 暑[あつ]いですね。",
    notes: "Used for weather and air temperature. 熱い is for objects and liquids; 厚い is thick.",
    pitch: "アツ＼イ", freq: 1500, imageAlt: "暑がる人のイラスト", homophones: [510, 1505], sharedKanji: [], similarMeaning: [510],
  },
  {
    id: 1505, word: "厚い", reading: "あつい", meaning: "thick",
    sentence: "厚い本を買いました。", sentenceEn: "I bought a thick book.",
    sentenceFurigana: " 厚[あつ]い 本[ほん]を 買[か]いました。",
    notes: "Same reading as 暑い and 熱い but unrelated meaning. Antonym: 薄い (thin).",
    pitch: "アツ＼イ", freq: 2600, imageAlt: "厚い本のイラスト", homophones: [510, 1504], sharedKanji: [], similarMeaning: [],
  },
  {
    id: 1506, word: "飴", reading: "あめ", meaning: "candy",
    sentence: "子供に飴をあげた。", sentenceEn: "I gave the child a candy.",
    sentenceFurigana: " 子供[こども]に 飴[あめ]をあげた。",
    notes: "Pitch: あ↗め (low-high). 雨 (rain) is あ↘め (high-low).",
    pitch: "アメ", freq: 3000, imageAlt: "飴のイラスト", homophones: [908], sharedKanji: [], similarMeaning: [],
  },
];

const base = raw as Word[];
export const words: Word[] = [...base, ...extras];
const byId = new Map(words.map((w) => [w.id, w]));
const byWord = new Map<string, Word>();
for (const w of words) if (!byWord.has(w.word)) byWord.set(w.word, w);

// Patch base entries that gained homophones from the extras.
const patch = (word: string, ids: number[]) => {
  const w = byWord.get(word);
  if (w) w.homophones = Array.from(new Set([...w.homophones, ...ids]));
};
patch("熱い", [1504, 1505]);
patch("雨", [1506]);

export const getWord = (id: number) => byId.get(id);
export const findWord = (w: string) => byWord.get(w);

const antonymPairs: [string, string][] = [
  ["大きい", "小さい"], ["高い", "安い"], ["高い", "低い"], ["新しい", "古い"], ["暑い", "寒い"],
  ["早い", "遅い"], ["速い", "遅い"], ["多い", "少ない"], ["行く", "来る"], ["開ける", "閉める"],
  ["買う", "売る"], ["上", "下"], ["右", "左"], ["前", "後ろ"], ["明るい", "暗い"], ["近い", "遠い"],
  ["長い", "短い"], ["厚い", "薄い"], ["熱い", "冷たい"], ["強い", "弱い"], ["広い", "狭い"],
  ["重い", "軽い"], ["好き", "嫌い"], ["始まる", "終わる"], ["入る", "出る"], ["男", "女"],
  ["朝", "夜"], ["簡単", "難しい"], ["同じ", "違う"], ["忙しい", "暇"],
];

export function antonymsOf(w: Word): Word[] {
  const out: Word[] = [];
  for (const [a, b] of antonymPairs) {
    if (a === w.word && byWord.get(b)) out.push(byWord.get(b)!);
    if (b === w.word && byWord.get(a)) out.push(byWord.get(a)!);
  }
  return out;
}

const ids = (list: number[]) => list.map((i) => byId.get(i)).filter(Boolean) as Word[];

export type ConfusionKind = "homophone" | "kanji" | "meaning";

/** Ordered set of words the learner is likely to mix up with `w`. */
export function confusablesOf(w: Word): { kind: ConfusionKind; words: Word[] } | null {
  const homo = ids(w.homophones).filter((x) => x.word !== w.word);
  if (homo.length) return { kind: "homophone", words: homo };
  const mean = ids(w.similarMeaning).filter((x) => x.word !== w.word);
  if (mean.length) return { kind: "meaning", words: mean };
  const kan = ids(w.sharedKanji).filter((x) => x.word !== w.word);
  if (kan.length >= 1) return { kind: "kanji", words: kan.slice(0, 3) };
  return null;
}

export const related = (w: Word) => ({
  homophones: ids(w.homophones).filter((x) => x.word !== w.word),
  similarMeaning: ids(w.similarMeaning).filter((x) => x.word !== w.word),
  sharedKanji: ids(w.sharedKanji).filter((x) => x.word !== w.word),
  antonyms: antonymsOf(w),
});

/** Parses Kaishi furigana notation: " 私[わたし]はアンです" -> segments. */
export function parseFurigana(s: string): { text: string; rt?: string }[] {
  const out: { text: string; rt?: string }[] = [];
  const re = /\s?([^\s\[\]]+?)\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[1]!, rt: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.9;
  const v = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}
