# 行星×星座×宫位三元合成语法

## R — Reading
> 来源 `raw/legal_open/03_hobbiestostart_review.txt` L00035-L00060（第三方综述转述原书）：

> "When reading a birth chart, there are three symbols you need to synthesize: planets, signs, and houses…The planets are ways of talking about parts of your psyche…Everyone has the same basic needs and drives represented by the planets, but we all prefer to get those needs met in different ways. These differences are described by the signs…Houses describe the classrooms for the lessons of the signs."

Venus in Aries 例（03 L00049-L00060）：关系驱力在白羊=在关系中练习勇气；落在哪个宫，就在哪个领域练。

## I — Interpretation
【象征反思层】这是 Forrest 出生图解读的核心语法。三个符号各司其职：**行星=驱力（what）**——你内在的哪股冲动（关系/思考/行动/平衡…）；**星座=美德/风格（how）**——这股驱力被邀请以什么方式表达（勇气/平衡/好奇…）；**宫位=课堂（where）**——你会在哪个生活领域被反复邀请练习这个组合。三者合读才成一句话："你在用 [星座] 方式，在 [宫位] 领域，练习 [行星] 驱力的 [星座美德]。"单拎任何一个符号（如"我金星白羊"）都只是三个坐标中的一个，不完整。

## A1 — Application Example
原书 Venus 白羊例（third-party review, 03 L00049-L00060）：行星 Venus=关系驱力；星座 Aries=勇气美德；宫位决定"在哪练"——落第四宫（家）=在家庭中练习关系勇气；落第九宫（远航）=在陌生人中、在跨文化语境里练习关系勇气。合成演练：用户"我火星天蝎第八宫"。按语法：火星=行动驱力/愤怒与性能量；天蝎=深度、穿透、不肤浅的美德；第八宫=亲密、共享资源、转化的课堂。一句话："你在亲密与共享资源的领域，被邀请以深度与穿透的方式练习你的行动驱力——浅尝辄止会让这股能量卡住。"

## A2 — Future Trigger
**何时用**：
- 用户给出"某行星在某星座某宫位"并问什么意思
- 用户问"这个落座组合怎么解读"
- 用户有一张排好的盘，想逐点理解

**语言信号**：
- "我金星白羊 / 火星天蝎 / 月亮巨蟹"
- "XX 行星在 XX 宫是什么意思" / "what does [planet] in [sign] in the [house] mean"
- "这个配置怎么解读"

**与相邻卡区分**：本卡教"怎么把三个符号合成一句话"；行星各自代表什么驱力见 planets-as-teachers；星座怎么翻译成美德见 signs-as-virtues；先抓哪三件套见 primal-triad-first。

## E — Execution
1. **拆三个坐标**：从用户给出的落点中识别出行星、星座、宫位。完成标准：三个符号都被点名。
2. **分别翻译**：行星→驱力（用 planets-as-teachers 的教师词典）；星座→待养成美德（用 signs-as-virtues）；宫位→生活领域/课堂。完成标准：三部分各有一句翻译。
3. **合成一句话**：按"你在用 [how] 方式，在 [where] 领域，练习 [what] 驱力的 [how 美德]"句式合成。完成标准：一句话同时包含 what/how/where。
4. **附阴影面**：补一句该美德误用时的失败模式（见 signs-as-virtues 的 B 段）。完成标准：一句阴影面。
- 输入契约：行星名+星座名+宫位号。缺宫位说明需出生时间排盘。
- 输出契约：三行分别翻译 + 一句合成 + 一句阴影面。

## B — Boundary
- **反场景**：用户只问"太阳是什么意思"这种单一符号定义——不需要三元合成，直接查 planets-as-teachers。
- **常见误读**：宫位不是"你一定会发生什么事的领域"，而是"你会在那里被反复练习的课堂"。
- **技术备注**：靠近宫尾的行星（合宫位线/cusp），按 Forrest 惯例解释为偏向下一宫（01 L00072-L00073）。
- **证据缺口**：12 宫位逐一含义在开放证据中只详写了 1/3/5 宫；其余宫位含义列 needs_review，不编造。
