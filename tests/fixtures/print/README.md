# Print test fixtures

Saved copies of public pages from the `AI Reading List` (downloaded 2026-10-10,
one GET each, no login). They are used ONLY as test fixtures for
`lib/print/` (CLAUDE.md allows fixtures inside tests). Tests never use the
network. Files marked HAND-MADE are not real pages.

| File | Order | Title | URL | Why it is here |
|---|---|---|---|---|
| 81-titotal.substack.com.html | 81 | A deep critique of AI 2027's bad timeline models | https://titotal.substack.com/p/a-deep-critique-of-ai-2027s-bad-timeline | Substack, very long (12k words), 40 images, footnotes |
| 157-www.hyperdimensional.co.html | 157 | Among the Agents | https://www.hyperdimensional.co/p/among-the-agents | Substack custom domain, code blocks (2 `<pre>` in the page DOM; a raw grep finds 4 because 2 more sit in the embedded JSON) |
| 10-helentoner.substack.com.html | 10 | Unresolved debates about the future of AI | https://helentoner.substack.com/p/unresolved-debates-about-the-future | Substack with a YouTube iframe, footnotes, subscribe widgets |
| 29-www.dwarkesh.com.html | 29 | Demis Hassabis — Scaling, superhuman AIs, AlphaZero atop LLMs, AlphaFold | https://www.dwarkesh.com/p/demis-hassabis | Substack podcast: YouTube + Spotify + Apple Podcasts embeds, long transcript |
| 132-garymarcus.substack.com.html | 132 | Breaking: OpenAI's efforts at pure scaling have hit a wall. | https://garymarcus.substack.com/p/breaking-openais-efforts-at-pure | Small Substack post, subscription widget |
| 126-www.astralcodexten.com.html | 126 | Claude Fights Back | https://www.astralcodexten.com/p/claude-fights-back | Substack custom domain (publication name from JSON-LD), description is only "..." |
| 125-joecarlsmith.com.html | 125 | Takes on "Alignment Faking in Large Language Models" | https://joecarlsmith.com/2024/12/18/takes-on-alignment-faking-in-large-language-models/ | Long essay (20k words), generic path |
| 11-waitbutwhy.com.html | 11 | The AI Revolution: The Road to Superintelligence | https://waitbutwhy.com/2015/01/artificial-intelligence-revolution-1.html | Many images, generic path |
| 82-ai-2027.com.html | 82 | Timelines Forecast | https://ai-2027.com/research/timelines-forecast | Interactive, heavy page (1.4 MB), 8 tables, SVG chart |
| 13-intelligence-curse.ai.html | 13 | The Intelligence Curse | https://intelligence-curse.ai/ | Landing page: only the introduction; the report is on other pages |
| 15-papers.nips.cc.html | 15 | ImageNet Classification with Deep Convolutional Neural Networks | https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html | Abstract-only paper page (PDF behind a link) |
| 74-www.nber.org.html | 74 | The Simple Macroeconomics of AI | https://www.nber.org/papers/w32487 | Abstract + PDF link (scholarly landing page) |
| 75-situational-awareness.ai.html | 75 | I. From GPT-4 to AGI: Counting the OOMs | https://situational-awareness.ai/from-gpt-4-to-agi/ | Known "hard" site; 26 images, 2 tables |
| 151-lexfridman.com.html | 151 | Demis Hassabis: Future of AI, Simulating Reality, Physics and Video Games (Lex Fridman Podcast #475) | https://lexfridman.com/demis-hassabis-2-transcript | Very long transcript (27k words), dialogue turns, YouTube iframe |
| 189-swarmtraces.org.html | 189 | Revealing the details of how OpenAI agents hacked Hugging Face | https://swarmtraces.org/ | Site root that is an article: 35 code blocks, a `<video>` |
| 26-epoch.ai.html | 26 | Can AI scaling continue through 2030? | https://epoch.ai/publications/can-ai-scaling-continue-through-2030 | 125 images, tables inside closed pop-ups and collapsed sections (hidden content) |
| 186-www.lesswrong.com.html | 186 | Claude Opus 4.5 Achieves 50%-Time Horizon Of Around 4 hrs 49 Mins | https://www.lesswrong.com/posts/q5ejXr4CRuPxkgzJD/claude-opus-4-5-achieves-50-time-horizon-of-around-4-hrs-49 | Saved in step 6c. LessWrong (ForumMagnum, React streaming): short post (~360 words) with a long comment thread that Readability appended, page furniture (votes, tags, commenter list, "Curated and popular this week"), and `citation_title` meta that is not a paper |
| 60-www.anthropic.com.html | 60 | Natural emergent misalignment from reward hacking | https://www.anthropic.com/research/emergent-misalignment-reward-hacking | Saved in step 6c. Readability drops a real footnote paragraph (the canary-string note); the `<article>` keeps it |
| 16-arxiv.org-html.html | 16 | Attention Is All You Need (HTML version) | https://arxiv.org/html/1706.03762 | Real arXiv `/html/` paper (LaTeXML): MathML, figures as `<object>` SVG, tables |
| 175-www.interconnects.ai.html | 175 | When will average people feel AI's impact? | https://www.interconnects.ai/p/when-will-average-people-feel-ais | Saved in step 6c. Substack custom domain with an "embedded post" card whose logo image was counted as a missing image |
| 55-arxiv.org-html.html | 55 | Sleeper Agents: Training Deceptive LLMs that Persist Through Safety Training (HTML version) | https://arxiv.org/html/2401.05566v3 | Saved in step 6c. arXiv `/html/` paper: a diagram (`<object>` SVG) typeset inside an equation table, 60 figures, 23 tables, the version date only in the corner note ("17 Jan 2024") |
| 182-arxiv.org-html.html | 182 | Cache-to-Cache: Direct Semantic Communication Between Large Language Models (HTML version) | https://arxiv.org/html/2510.03215 | Saved in step 6c. arXiv `/html/` paper whose prompt boxes are LaTeXML pictures: the text sits in `<svg><foreignObject>` (was silently dropped and not counted) |
| 16-arxiv.org.html | 16 | Attention Is All You Need (abstract page) | https://arxiv.org/abs/1706.03762 | arXiv abstract page (an HTML version exists) |
| 92-arxiv.org.html | 92 | Measuring the Algorithmic Efficiency of Neural Networks (abstract page) | https://arxiv.org/abs/2005.04305 | arXiv abstract page (no HTML version: /html returned 404) |
| 14-academic.oup.com.html | 14 | Computing Machinery and Intelligence | https://academic.oup.com/mind/article/LIX/236/433/986238 | BLOCKED: real Cloudflare "Just a moment..." challenge (HTTP 403) |
| 38-karpathy.bearblog.dev.html | 38 | Sequoia Ascent 2026 summary | https://karpathy.bearblog.dev/sequoia-ascent-2026/ | BLOCKED: real Cloudflare challenge (HTTP 403) |
| handmade-substack-paywalled.html | — | (HAND-MADE) A Paid Post | https://example.substack.com/p/paid-post | HAND-MADE minimal page with Substack's real paywall markers (no paywalled post exists in the list) |
| handmade-js-shell.html | — | (HAND-MADE) A Long Interactive Essay About the Future | https://example.com/essay | HAND-MADE single-page-app shell: 112 KB of HTML, almost no text |
| handmade-empty.html | — | (HAND-MADE) empty page | https://example.com/empty | HAND-MADE page with no text |

PDF items are not here: PDFs are routed before extraction ("Open PDF").
