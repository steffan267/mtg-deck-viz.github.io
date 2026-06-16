# Moxfield bracket metric analysis

Corpus: `./data/moxfield-bracket-corpus.json`

Decks analyzed: **464**

## Source bracket summary

| Source bracket | Decks | Mean win | Mean cohesion | Mean self | Median win | Median cohesion | Median self |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B1 | 64 | 51.14 | 39.39 | 50.81 | 51 | 40 | 53 |
| B2 | 100 | 55.93 | 46.33 | 58.09 | 56 | 51 | 61 |
| B3 | 100 | 64.15 | 43.36 | 64.02 | 66 | 47 | 64 |
| B4 | 100 | 75.74 | 33.03 | 71.29 | 76 | 35 | 73 |
| B5 | 100 | 79.66 | 26.27 | 74.59 | 80 | 20 | 76 |

## Centroid classifier results

- Exact source-bracket accuracy from {win, cohesion, self}: **40.73%**
- Within ±1 source bracket from {win, cohesion, self}: **80.17%**
- Coarse bucket accuracy (B1-2 low / B3 mid / B4-5 high): **60.56%**

## Interpretation

- The three metrics encode a real power trend, especially from low brackets to high brackets.
- They are not reliable enough on their own for exact Moxfield bracket deduction.
- Exact bracketing likely also needs features such as Game Changers, tutor density, fast mana, and combo/archetype signals.

