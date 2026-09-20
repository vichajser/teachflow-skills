---
id: ppt-workflow
lang: en
title: Class slides
tagline: Turns the slide outline from your lesson plan into an editable .pptx, slide for slide.
inputs:
  - Slide outline (required — the PHASE 4 output of lesson-workflow)
  - Textbook source text (required)
  - Visual style (required — pick one of the 10 built-in styles, or describe your own)
checks:
  - The slide count matches the outline exactly (nothing dropped, merged or reordered)
  - No answers appear on task slides (answers live only on the separate Answer Check slide)
  - For a reading lesson, the textbook text is reproduced verbatim
  - Body text is 22pt or larger (readable from the back of the classroom)
  - Teacher notes sit in the slide notes, not on the screen students see
---

Text, tables and shapes are all real objects, so the file can be edited directly in
PowerPoint, Hancom Office or Keynote. Text is never baked into images.

This is not a minimal presentation deck or a photo poster. It is a teaching deck with the
textbook text, questions, task instructions, sentence frames, vocabulary hints, tables and
output scaffolds actually on the slides.

Korean fonts fall back in this order: Noto Sans KR → Pretendard → Apple SD Gothic Neo (macOS)
→ Malgun Gothic (Windows).

Pick one of the 10 built-in teaching visual styles, or describe the feel you want in your own
words. If no style is chosen, the list is shown and you choose from it. With no slide outline
to work from, the skill stops and tells you to make one first.

### What to attach

- Confirmed slide outline — required. Page numbers, titles, what students see, the task, teacher notes.
- Textbook source text — required. So the original text goes onto the slides verbatim instead of being invented.
- Visual style — required. Describe the feel yourself, or pick one of the 10 built-in styles.

### What to type

> Turn this outline into an editable slide deck.

All three inputs have to be present before it starts. If you gave no style, it shows the 10 built-in teaching styles and asks you to pick one — the only real question among the six skills. With no outline it stops and tells you to make one first, pointing you at the PHASE 4 output of lesson-workflow. The result is one `.pptx`, fully editable.
