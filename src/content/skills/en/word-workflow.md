---
id: word-workflow
lang: en
title: Vocabulary table
tagline: Organises the unit's core vocabulary into an 11-column study table.
inputs:
  - Student textbook source text (required — the first-priority source for words and example sentences)
  - Lesson plan (required — decides which words count as core for this period)
  - The textbook's vocabulary list page (attach it if the textbook has one — it takes priority)
checks:
  - You have verified the pronunciation symbols yourself — this is what AI gets wrong most often
  - You have compared the textbook example sentences line by line — the second most frequent error
  - The student self-check column is empty (students fill that column in themselves)
---

Two files come out: `.xlsx` as the main output, and `.csv` for importing straight into Google
Sheets. It prints cleanly for handing out in class.

Each word gets a row with its pronunciation, part of speech, English and Korean meanings, **the
example sentence from the textbook**, a new example, extended vocabulary, collocations, common
mistakes, and a student self-check column.

This is **not** a generic vocabulary practice worksheet. It is a structured study table. If you
want students solving problems, use worksheet-workflow.

**Word counts by level**

| Level | Count |
| --- | --- |
| A1 / A2 | 5–8 |
| B1 | 8–12 |
| B2 / C1 | 10–15 |

Where the textbook has no complete example sentence, the closest phrase is used and flagged as
such. Where there is no basis at all, the cell is left blank and flagged — never invented. Those
two checks (pronunciation symbols and source example sentences) are always stated in the output
guidance.

### What to attach

- Student textbook source text — required. The first-priority source for words and example sentences.
- Lesson plan — required. Shows which words count as core for this period.
- The textbook's vocabulary list page — required if the textbook has one. When it exists, that list takes priority.

### What to type

> Make a vocabulary sheet from this unit and export it to Google Sheets.

No question comes back. The table is built from the textbook text, with the lesson plan as secondary support — it will not build the table from the lesson plan alone. Where a vocabulary list page exists, that list is used first. Two files come out: `.xlsx` and `.csv` for Google Sheets.
