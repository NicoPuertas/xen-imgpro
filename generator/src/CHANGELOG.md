# Changelog

Newest first. Every upload to Perchance adds an entry here and bumps `VERSION.json`
(`tools/make_upload.py` refuses to build unless both agree). The version shown in the
generator's footer comes from `VERSION.json`; clicking it shows this file.

## [1.4.0] - 2026-10-25 UTC
- Attempts viewer: every try now keeps its full-size image. Cards use larger, sharper thumbnails; clicking an image opens it at its real generated resolution (click again to fit the screen).
- "Use this image" (on the card and in the full-size view) puts any finished try into the frame, replacing the inspector's pick; the save button and the frame's image follow the shown try.

## [1.3.0] - 2026-10-25 UTC
- Version and changelog: `src/VERSION.json` + `src/CHANGELOG.md`; the footer shows the version and opens this changelog.
- Ships everything from 1.2.0 below (it was not uploaded on its own).

## [1.2.0] - 2026-10-25 UTC
- Retry ranking by hand severity: correct hands > wrong finger count > malformed hands (fused, blobby, sausage-like, distorted). It decides the kept try when none is accepted.
- A try is accepted only with score >= 8, no listed defects and correct hands.
- Retries add a gentle, escalating hand-boost wording to the prompt and negative prompt (levels 1-3, weights <= 1.2, same seed, never on try 1).
- Attempts viewer shows each try's hand verdict and boost level.
- Hidden retry iframes are removed 2 s after finishing (avoids embed AbortErrors).

## [1.1.1] - 2026-10-25 UTC
- Stricter judging: the judge lists every hand with its digit count first; code overrides the score when it reports a wrong count or fused/extra fingers.
- Accepted tries get a hands-only second opinion.

## [1.1.0] - 2026-10-25 UTC
- AI image inspector: "Retries" dropdown (1-10, default 1 = off). Each frame is regenerated with the SAME seed up to N times, scored by a vision model against the negative prompt and visible anatomy, and the best try is kept.
- Progress strip and chip on each frame; attempts viewer (🔍) with accepted/rejected verdicts, scores, defects, seed and time.

## [1.0.0] - 2026-10-25 UTC
- Initial import of perchance.org/xen-imgpro4 into this repository.
