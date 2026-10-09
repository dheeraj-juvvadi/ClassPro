// Original Wildflower colors mapped to Catnap Alley roles. Keep each source
// color as a fallback so the default appearance is unchanged.
export const roleGroups = {
  page: '191b19 191b18 171b16 171c16 191d17 141a17',
  inset: '1c1e1b 1d211d 20211f 20231e 20231f 20241e 20251c 20261d 20271e 22261f',
  surface: '232720 23281d 23281f 232820 232a20 242821 242a20 252b20 252b21 252c22 252e21 262e21 282e24 2a3024 2a3025 2b3029 2d322a',
  raised: '263822 273320 283122 283222 283520 293225 293322 293b20 2c3526 2d3525 30372b 30382a 303d27 33452b 343a2e 343a30 34412b 35402d 39412f 39432d 3b5031 3c4c31 4b5c3b',
  line: '31392c 343b30 353c30 363e30 373c32 373d36 373e31 393e33 3b4035 3b4235 3b4333 3b4432 3b4434 404638 414a3b 42483b 424b35 424c3b 434b3d 444a3d 444c3d 45483e 46483e 464e3d 48503e 49523e 4a5141 4a543f 4d5a41 4f5b42 505846 505849 535c4b 535d4b 536047 56624a 59644f 5d664f 5d704b 626e53 636f56 63714f 697454 768364',
  ink: 'f1eee2 f1eee3 f1efe5 f1efe6 f0f2e5 efeee4 eeeede edf0e5 edf0e7 e6eee7 e5e9cf e5e9dc e6eadc e4e8d5 e3e7d6 d8dfc8 d9dfc7 d7ddcd d3dac8 d3dcc7 cdd2c6 c7cfbc',
  muted: '7b8473 8b9382 8e9b7c 929b87 939c88 959e89 969e8b 969f8f 9fa693 a2aa97 a3ac98 a6ac9f a9b39b a9b9ac aaa7b7 aab49e abb69e acb89d adb4a4 adb7a0 adb7a2 adb7a3 aeb5a4 aeb6a0 aeb7a2 aeb8a2 b0b7a5 b0b7a7 b3ac9e b3b8ab b4bdab b7bfad b7bfb0 b7c2a0 b7c4a8 b8bdaa b8c0ab b8c2ad b8c4aa b9c1ad bac5aa bbc1b4 bec7b2 c1c8b8 c4cfb3 c5ccba c5cfb4 cad2c0',
  accent: '839572 849266 a6b884 aebf99 b8c398 b8c799 bacaa4 bddb91 bdcaa9 bfc98f c5d4a7 cbd7b6 cbd8b5 d1dfb7 d4dec1 d5dda9 d5ddca d5e4bb d7e5bf d8e2c5 d8e2ca d8e6b5',
  'accent-hover': 'e0e6cc e0e8d0 e4e9d5 e4efce e6edc2 e7efd9 eef6dc',
  'on-accent': '233020 252b1c 263620 163521 174a32 265d43 1c3028',
  risk: 'e3957c eda68f edb39c e2aa96 e59b83 efaa92 f8b59d ffb8a4 ffc0aa',
  'risk-card': 'bb6450',
  'risk-surface': '3a2520 3b2924 332a25',
  'risk-line': '8c5945 963928',
  'on-risk': '211b17 fff1ec',
  warning: 'e5cf95 e7c6a1 d3ad66 d4c49b d6bd80 dfb993 efb063 f0b795 e6d7b5 bba995 897450 826342 bd6e17',
  'warning-card': 'cfb77a',
  'warning-surface': '343022',
  'on-warning': '302815',
  positive: 'a1d8b4 b6d5a4 bde9cb',
  focus: 'a4a8df',
};
// Rare overlay colors use the same roles while retaining their original alpha.
export const translucentRoles = {
  '191b19d9': 'page', '191b19de': 'page', '1d211dfa': 'inset',
  '080b08b8': 'page', '10160dd9': 'page', '0b100d40': 'page',
  '24322126': 'on-accent', '454a393d': 'line', '525c474d': 'line',
  'bac69a30': 'accent', 'bfc98f35': 'accent', 'c5d4a740': 'accent',
  'c5d4a766': 'accent', 'c9d7a50c': 'accent', 'c9d7a512': 'accent',
  'd5dda910': 'accent', 'edf1d42a': 'accent', 'f1eee380': 'ink',
};
